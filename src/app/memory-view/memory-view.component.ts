import {
    Component, OnInit, Input, OnDestroy, SimpleChanges, OnChanges,
    EventEmitter, Output
} from '@angular/core';

import {
    MemoryOperation, MemoryService, MemoryOperationType,
    MemoryOperationParamsLoadStore,
    MemoryOperationParamsStoreBytes,
    MemoryOperationParamsAddRegion
} from '../memory.service';

import { Subscription } from 'rxjs/Subscription';

import { ErrorBarService } from '../error-bar.service';
import { Utils } from '../utils';
import { CPUService } from '../cpu.service';
import {
    CPURegisterIndex, CPURegisterOperation, CPURegisterOperationType,
    CPURegisterRegularOpParams, CPURegisterBitOpParams
} from '../cpuregs';


class MemoryCellView {

    private _value: number;
    private _strValue: string;

    public style: string;
    public isMemoryRegion = false;
    public memoryRegionStyle: string;
    public address: number;
    public isInstruction: boolean;

    constructor(address: number, initialValue: number = 0, initialStyle?: string, isInstruction: boolean = false) {

        this.style = initialStyle;
        this._value = initialValue;
        this._strValue = Utils.pad(initialValue, 16, 2);
        this.address = address;
        this.isInstruction = isInstruction;

    }

    get value() {

        return this._value;

    }

    get strValue() {

        return this._strValue;

    }

    set value(newValue: number) {

        this._value = newValue;
        this._strValue = Utils.pad(newValue, 16, 2);

    }

}

class CPURegisterPointer {

    public index: CPURegisterIndex;
    public value: number;

    constructor(index: CPURegisterIndex, initialValue: number) {

        this.index = index;
        this.value = initialValue;

    }

}


@Component({
    selector: 'app-memory-view',
    templateUrl: './memory-view.component.html'
})
export class MemoryViewComponent implements OnInit, OnDestroy, OnChanges {

    @Input() mapping: Map<number, number>;
    @Input() displayA: boolean;
    @Input() displayB: boolean;
    @Input() displayC: boolean;
    @Input() displayD: boolean;
    @Input() showInstructions: boolean;

    @Output() onMemoryCellClick = new EventEmitter<number>();

    public splitMemoryArea = false;

    public memoryCellViews: Array<MemoryCellView>;

    private memoryRegionViews: Map<string, {'startAddress': number, 'endAddress': number}> =
        new Map<string, {'startAddress': number, 'endAddress': number}>();

    private memoryOperationSubscription: Subscription;
    private cpuRegisterOperationSubscription: Subscription;

    public memoryColsIndexes: string[] = [];
    public memoryRowsIndexes: string[] = [];

    public size: number;

    public editingCell = [-1, -1];
    public newCellValue: string;

    private sspCells: Array<number> = [];
    private uspCells: Array<number> = [];

    private registerPointers: Map<CPURegisterIndex, CPURegisterPointer> = new Map<CPURegisterIndex, CPURegisterPointer>();

    private registerSR: number;

    constructor(private memoryService: MemoryService,
                private cpuService: CPUService,
                private errorBarService: ErrorBarService) {

        this.size = memoryService.getSize();

        this.createIndexes();

        this.memoryCellViews = new Array<MemoryCellView>(this.size);

        for (let i = 0; i < this.size; i++) {

            this.memoryCellViews[i] = new MemoryCellView(i, 0);

        }

        const registerBank = this.cpuService.getRegistersBank();

        const registerAPointer = new CPURegisterPointer(CPURegisterIndex.A, registerBank.get(CPURegisterIndex.A).value);
        this.registerPointers.set(CPURegisterIndex.A, registerAPointer);
        this.registerPointers.set(CPURegisterIndex.AH, registerAPointer);
        this.registerPointers.set(CPURegisterIndex.AL, registerAPointer);

        const registerBPointer = new CPURegisterPointer(CPURegisterIndex.B, registerBank.get(CPURegisterIndex.B).value);
        this.registerPointers.set(CPURegisterIndex.B, registerBPointer);
        this.registerPointers.set(CPURegisterIndex.BH, registerBPointer);
        this.registerPointers.set(CPURegisterIndex.BL, registerBPointer);

        const registerCPointer = new CPURegisterPointer(CPURegisterIndex.C, registerBank.get(CPURegisterIndex.C).value);
        this.registerPointers.set(CPURegisterIndex.C, registerCPointer);
        this.registerPointers.set(CPURegisterIndex.CH, registerCPointer);
        this.registerPointers.set(CPURegisterIndex.CL, registerCPointer);

        const registerDPointer = new CPURegisterPointer(CPURegisterIndex.D, registerBank.get(CPURegisterIndex.D).value);
        this.registerPointers.set(CPURegisterIndex.D, registerDPointer);
        this.registerPointers.set(CPURegisterIndex.DH, registerDPointer);
        this.registerPointers.set(CPURegisterIndex.DL, registerDPointer);

        const registerSSPPointer = new CPURegisterPointer(CPURegisterIndex.SSP, registerBank.get(CPURegisterIndex.SSP).value);
        this.registerPointers.set(CPURegisterIndex.SSP, registerSSPPointer);

        const registerUSPPointer = new CPURegisterPointer(CPURegisterIndex.USP, registerBank.get(CPURegisterIndex.USP).value);
        this.registerPointers.set(CPURegisterIndex.USP, registerUSPPointer);

        const registerIPPointer = new CPURegisterPointer(CPURegisterIndex.IP, registerBank.get(CPURegisterIndex.IP).value);
        this.registerPointers.set(CPURegisterIndex.IP, registerIPPointer);

        this.registerSR = registerBank.get(CPURegisterIndex.SR).value;

        this.updateCellStyle(registerIPPointer.value);
        this.updateCellStyle(registerSSPPointer.value);
        this.updateCellStyle(registerUSPPointer.value);

        this.memoryOperationSubscription = this.memoryService.memoryOperation$.subscribe(
            (memoryOperation) => this.processMemoryOperation(memoryOperation)
        );

        this.cpuRegisterOperationSubscription = this.cpuService.cpuRegisterOperation$.subscribe(
            (cpuRegisterOperation) => this.processCPURegisterOperation(cpuRegisterOperation)
        );

    }

    private createIndexes() {

        for (const i of Array.from({length: 16}, (value, key) => key)) {

            this.memoryColsIndexes.push(Utils.pad(i, 16, 1));

        }

        for (const i of Array.from({length: this.memoryService.getSize() / 16}, (value, key) => key)) {

            this.memoryRowsIndexes.push(Utils.pad(i, 16, 3));

        }

    }

    ngOnInit() {
    }

    ngOnDestroy() {

        this.memoryOperationSubscription.unsubscribe();

    }

    private operationAddRegion(regionID: string, name: string, startAddress: number, endAddress: number,
                               initialValues?: Array<number>) {

        for (let i = startAddress; i <= endAddress; i++) {

            this.memoryCellViews[i].value = initialValues ? initialValues[i] : 0;
            this.memoryCellViews[i].isMemoryRegion = true;
            this.memoryCellViews[i].memoryRegionStyle =
                name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
            this.updateCellStyle(i);
        }

        this.memoryRegionViews.set(regionID, {'startAddress': startAddress, 'endAddress': endAddress});

    }

    private operationWriteByte(address: number, value: number) {

        this.memoryCellViews[address].value = value;

    }

    private operationWriteWord(address: number, value: number) {

        this.memoryCellViews[address].value = (value & 0xFF00) >>> 8;
        this.memoryCellViews[address + 1].value = (value & 0x00FF);

    }


    private operationWriteCells(initialAddress: number, size: number, values: Array<number>) {

        for (let i = initialAddress; i < initialAddress + size; i++) {

            this.memoryCellViews[i].value = values ? values[i] : 0;

        }

    }

    private operationReset() {

        for (let i = 0; i < this.size; i++) {

            if (this.memoryCellViews[i].isMemoryRegion === false) {
                this.memoryCellViews[i].value = 0;
            }

        }

        // And we have to flush the stack
        let previousStackedCells = this.sspCells;
        this.sspCells = [];
        previousStackedCells.forEach((cell) => this.updateCellStyle(cell));

        previousStackedCells = this.uspCells;
        this.uspCells = [];
        previousStackedCells.forEach((cell) => this.updateCellStyle(cell));

    }

    private operationPush(index: CPURegisterIndex, value: number) {

        let cells;

        const registerPointer = this.registerPointers.get(index);
        const previousRegisterPointer = registerPointer.value;

        registerPointer.value = value;

        switch (index) {

            case CPURegisterIndex.SSP:
                cells = this.sspCells;
                break;
            case CPURegisterIndex.USP:
                cells = this.uspCells;
                break;

        }

        for (let i = 0; previousRegisterPointer - i !== value; i++) {
            cells.push(previousRegisterPointer - i);
            this.updateCellStyle(previousRegisterPointer - i);
        }

        this.updateCellStyle(value);

    }

    private operationPop(index: CPURegisterIndex, value: number) {

        let cells;

        const registerPointer = this.registerPointers.get(index);
        const previousRegisterPointer = registerPointer.value;

        registerPointer.value = value;

        switch (index) {

            case CPURegisterIndex.SSP:
                cells = this.sspCells;
                break;
            case CPURegisterIndex.USP:
                cells = this.uspCells;
                break;

        }

        for (let i = 1; previousRegisterPointer + i <= value; i++) {
            cells.splice(cells.indexOf(previousRegisterPointer + i), 1);
            this.updateCellStyle(previousRegisterPointer + i);
        }

        this.updateCellStyle(previousRegisterPointer);

    }

    private operationWriteRegister(index: CPURegisterIndex, value: number) {

        let display;

        if (index === CPURegisterIndex.SR) {
            this.registerSR = value;
            this.updateCellStyle(this.registerPointers.get(CPURegisterIndex.SSP).value);
            this.updateCellStyle(this.registerPointers.get(CPURegisterIndex.USP).value);
            return;
        }

        const registerPointer = this.registerPointers.get(index);

        const previousRegisterPointer = registerPointer.value;

        switch (index) {
            case CPURegisterIndex.AH:
            case CPURegisterIndex.BH:
            case CPURegisterIndex.CH:
            case CPURegisterIndex.DH:
                registerPointer.value = (previousRegisterPointer & 0x00FF) + (value << 8);
                break;
            case CPURegisterIndex.AL:
            case CPURegisterIndex.BL:
            case CPURegisterIndex.CL:
            case CPURegisterIndex.DL:
                registerPointer.value = (previousRegisterPointer & 0xFF00) + value;
                break;
            default:
                registerPointer.value = value;
                break;
        }

        switch (index) {

            case CPURegisterIndex.A:
            case CPURegisterIndex.AH:
            case CPURegisterIndex.AL:
                display = this.displayA;
                break;
            case CPURegisterIndex.B:
            case CPURegisterIndex.BH:
            case CPURegisterIndex.BL:
                display = this.displayB;
                break;
            case CPURegisterIndex.C:
            case CPURegisterIndex.CH:
            case CPURegisterIndex.CL:
                display = this.displayC;
                break;
            case CPURegisterIndex.D:
            case CPURegisterIndex.DH:
            case CPURegisterIndex.DL:
                display = this.displayD;
                break;
            default:
                display = true;
                break;

        }

        if (display === true) {

            if (previousRegisterPointer >= 0 && previousRegisterPointer < this.size) {
                this.updateCellStyle(previousRegisterPointer);
            }
            this.updateCellStyle(registerPointer.value);
        }

    }

    private operationWriteBit(index: number, bitNumber: number, value: number) {

        if (index === CPURegisterIndex.SR) {

            if (value === 0) {
                this.registerSR &= ~(1 << bitNumber);
            } else {
                this.registerSR |= (1 << bitNumber);
            }

            this.updateCellStyle(this.registerPointers.get(CPURegisterIndex.SSP).value);
            this.updateCellStyle(this.registerPointers.get(CPURegisterIndex.USP).value);

        }

    }

    private processCPURegisterOperation(cpuRegisterOperation: CPURegisterOperation) {

        switch (cpuRegisterOperation.operationType) {

            case CPURegisterOperationType.WRITE:
                this.operationWriteRegister(
                    (<CPURegisterRegularOpParams>cpuRegisterOperation.data).index,
                    (<CPURegisterRegularOpParams>cpuRegisterOperation.data).value);
                break;
            case CPURegisterOperationType.WRITE_BIT:
                this.operationWriteBit(
                    (<CPURegisterBitOpParams>cpuRegisterOperation.data).index,
                    (<CPURegisterBitOpParams>cpuRegisterOperation.data).bitNumber,
                    (<CPURegisterBitOpParams>cpuRegisterOperation.data).value);
                break;
            case CPURegisterOperationType.PUSH:
                this.operationPush(
                    (<CPURegisterRegularOpParams>cpuRegisterOperation.data).index,
                    (<CPURegisterRegularOpParams>cpuRegisterOperation.data).value);
                break;
            case CPURegisterOperationType.POP:
                this.operationPop(
                    (<CPURegisterRegularOpParams>cpuRegisterOperation.data).index,
                    (<CPURegisterRegularOpParams>cpuRegisterOperation.data).value);
                break;
            default:
                break;
        }

    }

    private processMemoryOperation(memoryOperation: MemoryOperation) {

        switch (memoryOperation.operationType) {

            case MemoryOperationType.ADD_REGION:
                this.operationAddRegion(
                    (<MemoryOperationParamsAddRegion>memoryOperation.data).regionID,
                    (<MemoryOperationParamsAddRegion>memoryOperation.data).name,
                    (<MemoryOperationParamsAddRegion>memoryOperation.data).startAddress,
                    (<MemoryOperationParamsAddRegion>memoryOperation.data).endAddress,
                    (<MemoryOperationParamsAddRegion>memoryOperation.data).initialValues);
                break;
            case MemoryOperationType.STORE_BYTE:
                this.operationWriteByte(
                    (<MemoryOperationParamsLoadStore>memoryOperation.data).address,
                    (<MemoryOperationParamsLoadStore>memoryOperation.data).value);
                break;
            case MemoryOperationType.STORE_BYTES:
                this.operationWriteCells(
                    (<MemoryOperationParamsStoreBytes>memoryOperation.data).initialAddress,
                    (<MemoryOperationParamsStoreBytes>memoryOperation.data).size,
                    (<MemoryOperationParamsStoreBytes>memoryOperation.data).values);
                break;
            case MemoryOperationType.STORE_WORD:
                this.operationWriteWord(
                    (<MemoryOperationParamsLoadStore>memoryOperation.data).address,
                    (<MemoryOperationParamsLoadStore>memoryOperation.data).value);
                break;
            case MemoryOperationType.RESET:
                this.operationReset();
                break;
            default:
                break;
        }

    }

    public setCellValue(view: number, address: number) {


        try {
            this.memoryService.storeByte(address, parseInt(this.newCellValue, 16), false);

            if (this.memoryCellViews[address].isInstruction === true) {
                this.memoryCellViews[address].isInstruction = false;
                this.updateCellStyle(address);
            }

        } catch (e) {
            this.errorBarService.setErrorMessage(e.toString());
        }

        this.editingCell[view] = -1;

    }

    private isSupervisorMode(): boolean {

        return ((this.registerSR & 0x8000) !== 0);

    }

    private updateCellStyle(address: number) {

        /* Order of styling:
         * - instruction pointer >
         * - stack pointer >
         * - register A pointer >
         * - register B pointer >
         * - register C pointer >
         * - register D pointer >
         * - stack
         * - mapped instruction >
         * - region
         */

        if (address < 0 || address >= this.size) {
            return;
        }

        this.memoryCellViews[address].style = undefined;

        if (this.memoryCellViews[address].memoryRegionStyle !== undefined) {
            this.memoryCellViews[address].style = this.memoryCellViews[address].memoryRegionStyle;
        }

        if (this.showInstructions &&
            this.memoryCellViews[address].isInstruction === true) {
            this.memoryCellViews[address].style = 'instr-bg';
        }

        if (this.uspCells.indexOf(address) !== -1) {
            this.memoryCellViews[address].style = 'usp-stack-bg';
        }

        if (this.sspCells.indexOf(address) !== -1) {
            this.memoryCellViews[address].style = 'ssp-stack-bg';
        }

        if (this.displayD === true &&
            this.registerPointers.get(CPURegisterIndex.D).value === address) {
            this.memoryCellViews[address].style = 'marker marker-d';
        }

        if (this.displayC === true &&
            this.registerPointers.get(CPURegisterIndex.C).value === address) {
            this.memoryCellViews[address].style = 'marker marker-c';
        }

        if (this.displayB === true &&
            this.registerPointers.get(CPURegisterIndex.B).value === address) {
            this.memoryCellViews[address].style = 'marker marker-b';
        }

        if (this.displayA === true &&
            this.registerPointers.get(CPURegisterIndex.A).value === address) {
            this.memoryCellViews[address].style = 'marker marker-a';
        }

        if (this.registerPointers.get(CPURegisterIndex.USP).value === address && !this.isSupervisorMode()) {
            this.memoryCellViews[address].style = 'marker marker-usp';
        }

        if (this.registerPointers.get(CPURegisterIndex.SSP).value === address && this.isSupervisorMode()) {
            this.memoryCellViews[address].style = 'marker marker-ssp';
        }

        if (this.registerPointers.get(CPURegisterIndex.IP).value === address) {
            this.memoryCellViews[address].style = 'marker marker-ip';
        }

    }

    ngOnChanges(changes: SimpleChanges) {

        if ('mapping' in changes) {

            /* We need to undo the previous assignment */

            const previousMapping: Map<number, number> = changes['mapping'].previousValue;

            if (previousMapping) {
                for (const i of Array.from(previousMapping.keys())) {

                    this.memoryCellViews[i].isInstruction = false;
                    this.updateCellStyle(i);

                }
            }

            const currentMapping: Map<number, number> = changes['mapping'].currentValue;

            if (currentMapping) {
                for (const i of Array.from(currentMapping.keys())) {

                    this.memoryCellViews[i].isInstruction = true;
                    this.updateCellStyle(i);

                }
            }

        }
        if ('displayA' in changes) {

            this.updateCellStyle(this.registerPointers.get(CPURegisterIndex.A).value);

        }
        if ('displayB' in changes) {

            this.updateCellStyle(this.registerPointers.get(CPURegisterIndex.B).value);

        }
        if ('displayC' in changes) {

            this.updateCellStyle(this.registerPointers.get(CPURegisterIndex.C).value);

        }
        if ('displayD' in changes) {

            this.updateCellStyle(this.registerPointers.get(CPURegisterIndex.D).value);

        }


    }

    public memoryCellClick(event: MouseEvent, view: number, address: number) {

        if (event.ctrlKey || event.metaKey) {

            this.editingCell[view] = address;
            this.newCellValue = this.memoryCellViews[address].strValue;

        } else {

            this.onMemoryCellClick.emit(address);

        }

    }

}
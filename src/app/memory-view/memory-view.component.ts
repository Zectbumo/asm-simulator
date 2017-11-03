import { Component, OnInit, Directive, AfterViewInit,
         ElementRef, Input, OnDestroy, SimpleChanges, OnChanges,
         EventEmitter, Output } from '@angular/core';
import { MemoryOperation, MemoryService, MemoryOperationType } from '../memory.service';
import { Subscription } from 'rxjs/Subscription';
import { ErrorBarService } from '../error-bar.service';


function pad(n: number, radix: number, width: number, zeroChar: string = '0'): string {

    const num = n.toString(radix).toUpperCase();
    return num.length >= width ? num : new Array(width - num.length + 1).join(zeroChar) + num;

}

@Directive({
    selector: '[appAutofocus]'
})
export class MemoryCellAutofocusDirective implements AfterViewInit {

    constructor(private el: ElementRef) {}

    ngAfterViewInit() {
        this.el.nativeElement.focus();
    }
}

class MemoryCellView {

    public dataValue: string;
    public style: string;
    public address: number;
    public isInstruction: boolean;

    constructor(address: number, initialValue: number = 0, initialStyle?: string, isInstruction: boolean = false) {

        this.style = initialStyle;
        this.dataValue = pad(initialValue, 16, 2);
        this.address = address;
        this.isInstruction = isInstruction;

    }


}


@Component({
    selector: 'app-memory-view',
    templateUrl: './memory-view.component.html',
    styleUrls: ['./memory-view.component.css']
})
export class MemoryViewComponent implements OnInit, OnDestroy, OnChanges {

    @Input() mapping: Map<number, number>;
    @Output() onMemoryCellClick = new EventEmitter<number>();

    public memoryCellViews: Array<MemoryCellView>;

    private memoryRegionViews: Map<string, {'startAddress': number, 'endAddress': number}> =
        new Map<string, {'startAddress': number, 'endAddress': number}>();

    private memoryOperationSubscription: Subscription;

    public memoryColsIndexes: string[] = [];
    public memoryRowsIndexes: string[] = [];

    public size: number;

    public editingCell = -1;
    public newCellValue: string;

    constructor(private memoryService: MemoryService,
                private errorBarService: ErrorBarService) {

        this.size = memoryService.getSize();

        this.createIndexes();

        this.memoryCellViews = new Array<MemoryCellView>(this.size);

        for (let i = 0; i < this.size; i++) {

            this.memoryCellViews[i] = new MemoryCellView(i, 0);

        }

    }

    private createIndexes() {

        for (const i of Array.from({length: 16}, (value, key) => key)) {

            this.memoryColsIndexes.push(pad(i, 16, 1));

        }

        for (const i of Array.from({length: this.memoryService.getSize() / 16}, (value, key) => key)) {

            this.memoryRowsIndexes.push(pad(i, 16, 3));

        }

    }

    ngOnInit() {

        this.memoryOperationSubscription = this.memoryService.memoryOperation$.subscribe(
            (memoryOperation) => this.processMemoryOperation(memoryOperation)
        );

    }

    ngOnDestroy() {

        this.memoryOperationSubscription.unsubscribe();

    }

    private operationAddRegion(regionID: string, name: string, startAddress: number, endAddress: number,
                               initialValue: number = 0) {

        for (let i = startAddress; i <= endAddress; i++) {

            this.memoryCellViews[i].dataValue = pad(initialValue, 16, 2);
            this.memoryCellViews[i].style =
                name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();

        }

        this.memoryRegionViews.set(regionID, {'startAddress': startAddress, 'endAddress': endAddress});

    }

    private operationRemoveRegion(regionID: string) {

        const memoryRegion = this.memoryRegionViews.get(regionID);

        if (memoryRegion) {

            const startAddress = memoryRegion['startAddress'];
            const endAddress = memoryRegion['endAddress'];

            for (let i = startAddress; i <= endAddress; i++) {

                this.memoryCellViews[i].dataValue = '00';
                this.memoryCellViews[i].style = undefined;

            }

        }

    }

    private operationWriteCell(address: number, value: number) {

        this.memoryCellViews[address].dataValue = pad(value, 16, 2);

    }

    private operationWriteCells(initialAddress: number, values: Array<number>) {

        for (let i = initialAddress; i < initialAddress + values.length; i++) {

            this.memoryCellViews[i].dataValue = pad(values[i], 16, 2);

        }

    }

    private processMemoryOperation(memoryOperation: MemoryOperation) {

        switch (memoryOperation.operationType) {

            case MemoryOperationType.ADD_REGION:
                this.operationAddRegion(
                    memoryOperation.data.get('regionID'),
                    memoryOperation.data.get('name'),
                    memoryOperation.data.get('startAddress'),
                    memoryOperation.data.get('endAddress'),
                    memoryOperation.data.get('initialValue'));
                break;
            case MemoryOperationType.REMOVE_REGION:
                this.operationRemoveRegion(memoryOperation.data.get('regionID'));
                break;
            case MemoryOperationType.WRITE_CELL:
                this.operationWriteCell(
                    memoryOperation.data.get('address'),
                    memoryOperation.data.get('value'));
                break;
            case MemoryOperationType.WRITE_CELLS:
                this.operationWriteCells(
                    memoryOperation.data.get('initialAddress'),
                    memoryOperation.data.get('values'));
                break;
            case MemoryOperationType.RESET: // TODO: Complete the code to reset the memory view
                break;
            case MemoryOperationType.SIZE_CHANGE: // TODO: Complete the code to update the size of the memory
                break;
            default:
                break;
        }

    }

    public setCellValue(address: number) {


        try {
            this.memoryService.store(address, parseInt(this.newCellValue, 16));
        } catch (e) {
            this.errorBarService.setErrorMessage(e.toString());
        }

        this.memoryCellViews[address].style = undefined;
        this.memoryCellViews[address].isInstruction = false;
        this.editingCell = -1;

    }

    ngOnChanges(changes: SimpleChanges) {

        if ('mapping' in changes && this.mapping) {

            for (const i of Array.from(this.mapping.keys())) {

                this.memoryCellViews[i].style = 'instr-bg';
                this.memoryCellViews[i].isInstruction = true;

            }

        }

    }

    public memoryCellClick(event: MouseEvent, address: number) {

        if (event.ctrlKey) {

            this.editingCell = address;
            this.newCellValue = this.memoryCellViews[address].dataValue;

        } else {

            this.onMemoryCellClick.emit(address);

        }

    }

}

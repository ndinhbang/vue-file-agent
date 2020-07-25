import { Component } from './component';
import template from './file-agent.html';
import FileRecord, { RawFileRecord } from '../lib/file-record';
import { FileIcon } from './file-icon';
import { FilePreview } from './file-preview';
import utils from '../lib/utils';
// import uploader from '../lib/uploader/upload-helper';
import uploader from '../lib/uploader/uploader';
import plugins from '../lib/plugins';
import { FileAgentProps, filePreviewProps } from '../lib/props';
import { ConfigureFn } from '../lib/uploader/ajax-request';
import { TransitionManager } from '../lib/transition-manager';

let fileAgentEl: Element;
let newFilePreviewEl: Element;

// tslint:disable-next-line
var dragCounter = 0;

plugins.uploader = uploader;

export { FileAgentProps };

export class FileAgent extends Component {
  private cachedElements: {
    fileRecord: FileRecord;
    filePreview: FilePreview;
    child: HTMLElement;
  }[] = [];
  isDragging = false;
  isSorting = false;
  isSortingActive = false;

  constructor(public $props: FileAgentProps) {
    super();
  }

  get isSortable() {
    return !!this.$props.sortable;
  }

  get hasMultiple() {
    // if (this.$props.multiple === undefined) {
    //   return Array.isArray(this.$props.value);
    // }
    return !!this.$props.multiple;
  }

  get canAddMore(): boolean {
    if (!this.hasMultiple) {
      return this.$props.fileRecords.length === 0;
    }
    if (!this.$props.maxFiles) {
      return true;
    }
    return this.$props.fileRecords.length < this.$props.maxFiles;
  }

  get helpTextComputed(): string {
    if (this.$props.helpText) {
      return this.$props.helpText;
    }
    return 'Choose ' + (this.hasMultiple ? 'files' : 'file') + ' or drag & drop here';
  }

  getFilePreviewForFileRecord(fileRecord: FileRecord) {
    const cachedElement = this.cachedElements.filter((ch) => ch.fileRecord === fileRecord)[0];
    if (cachedElement) {
      return cachedElement.filePreview;
    }
    return undefined;
  }

  getChildForFileRecord(fileRecord: FileRecord) {
    const cachedElement = this.cachedElements.filter((ch) => ch.fileRecord === fileRecord)[0];
    if (cachedElement) {
      return cachedElement.child;
    }
    return undefined;
  }

  setFilePreviewForFileRecord(fileRecord: FileRecord, filePreview: FilePreview, child: HTMLElement) {
    const cachedElement = this.cachedElements.filter((ch) => ch.fileRecord === fileRecord)[0];
    if (cachedElement) {
      cachedElement.filePreview = filePreview;
      return;
    }
    this.cachedElements.push({
      fileRecord,
      filePreview,
      child,
    });
  }

  equalFiles(file1: File, file2: File): boolean {
    return (
      true &&
      file1.name === file2.name &&
      file1.size === file2.size &&
      file1.type === file2.type &&
      // file1.lastModifiedDate.getTime() === file2.lastModifiedDate.getTime() &&
      file1.lastModified === file2.lastModified
    );
  }

  isFileAddedAlready(file: File): boolean {
    for (const fileRecord of this.$props.fileRecords) {
      if (this.equalFiles(file, fileRecord.file as File)) {
        return true;
      }
    }
    return false;
  }

  createThumbnail(fileRecord: FileRecord, video: HTMLVideoElement): Promise<void> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      utils
        .createVideoThumbnail(video, canvas, fileRecord.thumbnailSize, this.$props.averageColor !== false)
        .then((thumbnail) => {
          fileRecord.thumbnail(thumbnail);
          resolve();
        }, reject);
    });
  }

  initVideo(fileRecord: FileRecord): void {
    if (!fileRecord.isPlayableVideo()) {
      return;
    }
    const createObjectURL = (window.URL || window.webkitURL || {}).createObjectURL;
    const revokeObjectURL = (window.URL || window.webkitURL || {}).revokeObjectURL;
    const video = document.createElement('video');
    video.src = createObjectURL(fileRecord.file);
    this.createThumbnail(fileRecord, video).then(() => {
      revokeObjectURL(video.src);
      // if ((fileRecord as any)._filePreview) {
      //   (fileRecord as any)._filePreview.updateWrapper();
      // }
    });
    video.load();
  }

  getValidFileRecords(fileRecords: FileRecord[]) {
    const validFileRecords: FileRecord[] = [];
    for (const fileRecord of fileRecords) {
      if (!fileRecord.error) {
        validFileRecords.push(fileRecord);
      }
    }
    return validFileRecords;
  }

  /* Upload Methods */

  prepareConfigureFn(configureXhr?: ConfigureFn) {
    const uploadWithCredentials = this.$props.uploadWithCredentials;
    if (uploadWithCredentials !== true && uploadWithCredentials !== false) {
      return configureXhr;
    }
    return (request: XMLHttpRequest) => {
      request.withCredentials = uploadWithCredentials;
      if (typeof configureXhr === 'function') {
        configureXhr(request);
      }
    };
  }

  upload(
    url: string,
    headers: object,
    fileRecords: FileRecord[],
    createFormData?: (fileRecord: FileRecord) => FormData,
    configureXhr?: ConfigureFn,
  ): Promise<any> {
    const validFileRecords = this.getValidFileRecords(fileRecords);
    return new Promise((resolve, reject) => {
      plugins.uploader
        .upload(
          url,
          headers,
          this.$props,
          validFileRecords,
          createFormData,
          (overallProgress) => {
            // this.overallProgress = overallProgress;
          },
          this.prepareConfigureFn(configureXhr),
        )
        .then(
          (res: any) => {
            // for (let i = 0; i < res.length; i++) {
            //   res[i].fileRecord = validFileRecords[i];
            // }
            if (this.$props.events?.onUpload) {
              this.$props.events.onUpload(validFileRecords, res);
            }
            resolve(res);
          },
          (err: any) => {
            // for (let i = 0; i < err.length; i++) {
            //   err[i].fileRecord = validFileRecords[i];
            // }
            if (this.$props.events?.onUploadError) {
              this.$props.events.onUploadError(validFileRecords, err);
            }
            reject(err);
          },
        );
    });
  }

  deleteUpload(
    url: string,
    headers: object,
    fileRecord: FileRecord,
    uploadData?: any,
    configureXhr?: ConfigureFn,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      plugins.uploader
        .deleteUpload(url, headers, this.$props, fileRecord, uploadData, this.prepareConfigureFn(configureXhr))
        .then(
          (res: any) => {
            // res.fileRecord = fileRecord;
            if (this.$props.events?.onUploadDelete) {
              this.$props.events.onUploadDelete(fileRecord, res);
            }
            resolve(res);
          },
          (err: any) => {
            // err.fileRecord = fileRecord;
            if (this.$props.events?.onUploadDeleteError) {
              this.$props.events.onUploadDeleteError(fileRecord, err);
            }
            reject(err);
          },
        );
    });
  }

  updateUpload(
    url: string,
    headers: object,
    fileRecord: FileRecord,
    uploadData?: any,
    configureXhr?: ConfigureFn,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      plugins.uploader
        .updateUpload(url, headers, this.$props, fileRecord, uploadData, this.prepareConfigureFn(configureXhr))
        .then(
          (res: any) => {
            // res.fileRecord = fileRecord;
            if (this.$props.events?.onUploadUpdate) {
              this.$props.events.onUploadUpdate(fileRecord, res);
            }
            resolve(res);
          },
          (err) => {
            // err.fileRecord = fileRecord;
            if (this.$props.events?.onUploadUpdateError) {
              this.$props.events.onUploadUpdateError(fileRecord, err);
            }
            reject(err);
          },
        );
    });
  }

  autoUpload(fileRecords: FileRecord[]): Promise<any> {
    if (!this.$props.uploadUrl || this.$props.auto === false) {
      return Promise.resolve(false);
    }
    return this.upload(this.$props.uploadUrl, this.$props.uploadHeaders, fileRecords, this.$props.uploadConfig);
  }

  autoDeleteUpload(fileRecord: FileRecord): Promise<any> {
    if (!this.$props.uploadUrl || this.$props.auto === false) {
      return Promise.resolve(false);
    }
    return this.deleteUpload(this.$props.uploadUrl, this.$props.uploadHeaders, fileRecord, this.$props.uploadConfig);
  }

  autoUpdateUpload(fileRecord: FileRecord): Promise<any> {
    if (!this.$props.uploadUrl || this.$props.auto === false) {
      return Promise.resolve(false);
    }
    return this.updateUpload(this.$props.uploadUrl, this.$props.uploadHeaders, fileRecord, this.$props.uploadConfig);
  }

  /* Upload Methods */

  handleFiles(files: File[] | FileList): void {
    if (this.$props.disabled === true || this.$props.readonly === true) {
      return;
    }
    if (this.hasMultiple && !this.canAddMore) {
      return;
    }
    // const fileRecords: FileRecord[] = [];
    let filesArray: File[] = [];
    // tslint:disable-next-line
    for (let i = 0; i < files.length; i++) {
      if (this.hasMultiple && this.isFileAddedAlready(files[i])) {
        continue;
      }
      filesArray.push(files[i]);
    }
    if (
      this.hasMultiple &&
      this.$props.maxFiles &&
      filesArray.length > this.$props.maxFiles - this.$props.fileRecords.length
    ) {
      filesArray = filesArray.slice(0, this.$props.maxFiles - this.$props.fileRecords.length);
    }
    FileRecord.fromRawArray(
      filesArray.map((file) => {
        return { file } as RawFileRecord;
      }),
      {
        read: false,
        maxSize: this.$props.maxSize,
        accept: this.$props.accept,
        thumbnailSize: this.$props.thumbnailSize,
        averageColor: this.$props.averageColor,
      },
    ).then((fileRecords) => {
      for (const fileRecord of fileRecords) {
        if (fileRecord.file.size <= 20 * 1024 * 1024) {
          // <= 20MB
          this.initVideo(fileRecord);
        }
      }
      if (this.hasMultiple) {
        // splice: for list transitions to work properly
        this.$props.fileRecords.splice(this.$props.fileRecords.length, 0, ...fileRecords);
      } else {
        this.$props.fileRecords[0] = fileRecords[0];
      }

      if (this.$props.events?.onInput) {
        this.$props.events.onInput(this.$props.fileRecords);
      }
      if (this.$props.events?.onSelect) {
        this.$props.events.onSelect(fileRecords);
      }

      this.update();
      /*       FileRecord.readFiles(fileRecords).then((fileRecordsNew: FileRecord[]) => {
        // const allFileRecordsRaw = FileRecord.toRawArray(this.$props.fileRecords);
        // this.rawFileRecords = allFileRecordsRaw;
        // this.$emit('input', Array.isArray(this.value) ? allFileRecordsRaw : allFileRecordsRaw[0]);
        // this.$emit('select', FileRecord.toRawArray(fileRecordsNew));
      }); */
      this.autoUpload(fileRecords);
    });
    // for (const file of filesArray) {
    //   fileRecords.push(
    //     new FileRecord(
    //       {
    //         file,
    //       } as RawFileRecord,
    //       {
    //         read: false,
    //         maxSize: this.$props.maxSize,
    //         accept: this.$props.accept,
    //         thumbnailSize: this.$props.thumbnailSize,
    //         averageColor: this.$props.averageColor,
    //       },
    //     ),
    //   );
    // }
  }
  getIcon(props: { ext?: string; name?: string }) {
    const fileIcon = new FileIcon(props);
    return fileIcon.$el;
    // const div = document.createElement('div');
    // fileIcon.render(div);
    // return div.innerHTML;
  }

  iconByExt(ext: string) {
    return this.getIcon({ ext });
  }

  iconByName(name: string) {
    const svg = this.getIcon({ name });
    const div = document.createElement('div');
    div.appendChild(svg);
    return div.innerHTML;
  }

  getRef<T extends HTMLElement>(ref: string, el?: Element): T {
    return ((el || this.$el).querySelector('[data-ref="' + ref + '"]') as T) || document.createElement('span');
  }

  getSlot<T extends HTMLElement>(slot: string): T {
    return this.$el.querySelector('[data-slot="' + slot + '"]') as T;
  }

  deleteFileRecord(fileRecord: FileRecord) {
    const index = this.$props.fileRecords.indexOf(fileRecord);
    const deletedFileRecord = this.$props.fileRecords.splice(index, 1)[0];
    this.update();
    // if (this.$props.events?.onDelete) {
    //   this.$props.events.onDelete(fileRecord);
    // }
    if (this.$props.events?.onInput) {
      this.$props.events.onInput(this.$props.fileRecords);
    }
    this.onEventCheck(
      fileRecord,
      (fr) => {
        const promise = this.autoDeleteUpload(fr);
        promise.catch((err) => {
          this.cancelDeleteFileRecord(fr, index);
        });
        if (!this.$props.events?.onDelete) {
          return promise;
        }
        return this.$props.events.onDelete(fr);
      },
      () => {
        // no op
      },
      () => {
        this.cancelDeleteFileRecord(fileRecord, index);
      },
    );
  }

  renameFileRecord(fileRecord: FileRecord) {
    // if (this.$props.events?.onRename) {
    //   this.$props.events.onRename(fileRecord);
    // }
    this.onEventCheck(
      fileRecord,
      // this.$props.events?.onRename,
      (fr) => {
        const promise = this.autoUpdateUpload(fr);
        promise.catch((err) => {
          this.cancelRenameFileRecord(fr);
        });
        if (!this.$props.events?.onRename) {
          return promise;
        }
        return this.$props.events.onRename(fr);
      },
      () => {
        // no op
      },
      () => {
        this.cancelRenameFileRecord(fileRecord);
      },
    );
  }

  cancelDeleteFileRecord(fileRecord: FileRecord, index: number) {
    this.$props.fileRecords.splice(index, 0, fileRecord);
    this.update();
  }

  cancelRenameFileRecord(fileRecord: FileRecord) {
    fileRecord.nameWithoutExtension(false);
    // fileRecord.customName = fileRecord.oldCustomName;
    // if ((fileRecord as any)._filePreview) {
    //   (fileRecord as any)._filePreview.update();
    // }
  }

  onEventCheck(
    fileRecord: FileRecord,
    onEvent: ((FileRecord: FileRecord) => boolean | Promise<boolean>) | undefined,
    okFn: () => void,
    cancelFn: () => void,
  ) {
    if (!onEvent) {
      okFn();
      return;
    }
    const response = onEvent(fileRecord);
    if (utils.isPromise(response)) {
      (response as Promise<boolean>).then((result) => {
        if (result === false) {
          cancelFn();
        } else {
          okFn();
        }
      });
    } else {
      if (response === false) {
        cancelFn();
      } else {
        okFn();
      }
    }
  }

  onDeleteFileRecord(fileRecord: FileRecord) {
    this.onEventCheck(
      fileRecord,
      this.$props.events?.onBeforeDelete,
      () => {
        this.deleteFileRecord(fileRecord);
      },
      () => {
        // no op
      },
    );
  }

  onRenameFileRecord(fileRecord: FileRecord) {
    this.onEventCheck(
      fileRecord,
      this.$props.events?.onBeforeRename,
      () => {
        this.renameFileRecord(fileRecord);
      },
      () => {
        this.cancelRenameFileRecord(fileRecord);
      },
    );
  }

  filesChanged(event: InputEvent) {
    const files: FileList = (event.target as HTMLInputElement).files as FileList;
    if (this.$props.events?.onChange) {
      this.$props.events.onChange(event);
    }
    if (!files[0]) {
      return;
    }
    this.handleFiles(files);
    const input = this.getRef<HTMLInputElement>('file-input');
    if (input) {
      (input as any).value = null; // do not use ''
      // because chrome won't fire change event for same file
    }
  }

  drop(event: DragEvent): void {
    event.stopPropagation();
    event.preventDefault();
    dragCounter = 0;
    this.updateDragStatus(false);
    if (this.$props.disabled === true || this.$props.readonly === true) {
      return;
    }
    if (!event.dataTransfer) {
      return;
    }
    utils.getFilesFromDroppedItems(event.dataTransfer).then(
      (files) => {
        if (this.$props.events?.onDrop) {
          this.$props.events.onDrop(event);
        }
        if (!files || !files[0]) {
          return;
        }
        if (!this.hasMultiple) {
          files = [files[0]];
        }
        this.handleFiles(files);
      },
      (err) => {
        // no op
      },
    );
  }

  dragEnter(event: DragEvent): void {
    if (!event.dataTransfer) {
      return;
    }
    this.updateDragStatus(true);
    event.stopPropagation();
    event.preventDefault();
    dragCounter++;
    event.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
  }

  dragOver(event: DragEvent): void {
    if (!event.dataTransfer) {
      return;
    }
    this.updateDragStatus(true);
    event.stopPropagation();
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
  }

  dragLeave(event: DragEvent): void {
    if (!event.dataTransfer) {
      return;
    }
    dragCounter--;
    if (dragCounter === 0) {
      this.updateDragStatus(false);
    }
  }

  bindEvents() {
    // @dragover="dragOver"
    // @dragenter="dragEnter"
    // @dragleave="dragLeave"
    // @drop="drop"
    if (this.$props.draggable === false) {
      return;
    }
    const dragEl =
      this.$props.draggable === undefined || this.$props.draggable === true
        ? this.$el
        : (this.$props.draggable as HTMLElement);
    dragEl.ondragover = (event) => {
      this.dragOver(event);
    };
    dragEl.ondragenter = (event) => {
      this.dragEnter(event);
    };
    dragEl.ondragleave = (event) => {
      this.dragLeave(event);
    };
    dragEl.ondrop = (event) => {
      this.drop(event);
    };
  }

  updateDragStatus(isDragging: boolean) {
    // console.log('update drag status');
    if (this.isDragging === isDragging) {
      return;
    }
    // console.log('updating drag status...');
    this.isDragging = isDragging;
    if (this.$props.draggable === false) {
      return;
    }
    const dragEl =
      this.$props.draggable === undefined || this.$props.draggable === true
        ? this.$el
        : (this.$props.draggable as HTMLElement);
    this.toggleClass(dragEl, 'file-agent-drag-over', this.isDragging);
    if (this.isDragging) {
      // dragEl.classList.add('is-drag-over');
      // dragEl.classList.add('file-agent-drag-over');
      const isValid = !(
        this.$props.disabled === true ||
        this.$props.readonly === true ||
        (this.hasMultiple && !this.canAddMore)
      );
      this.toggleClass(dragEl, 'file-agent-drag-valid', isValid);
      this.toggleClass(dragEl, 'file-agent-drag-invalid', !isValid);
    } else {
      // dragEl.classList.remove('is-drag-over');
      // dragEl.classList.remove('file-agent-drag-over');
    }
    // this.updateWrapper();
  }

  updateWrapper() {
    this.$el.className = `theme-${this.$props.theme}
      is-sortable-${this.isSortable ? 'enabled' : 'disabled'}
      ${this.$props.sortable === 'hold' ? 'is-sortable-hold' : ''}
      ${this.$props.sortable === 'handle' ? 'is-sortable-handle' : ''}
      ${this.$props.sortable === true ? 'is-sortable-immediately' : ''}
      ${this.isSorting ? 'is-sorting' : ''}
      ${this.isSortingActive ? 'is-sorting-active' : ''}
      ${this.isDragging ? 'is-drag-over' : ''}
      ${this.$props.disabled === true ? 'is-disabled' : ''}
      ${this.$props.readonly === true ? 'is-readonly' : ''}
      ${
        !(this.$props.disabled === true || this.$props.readonly === true || (this.hasMultiple && !this.canAddMore))
          ? 'is-drag-valid'
          : ''
      }
    `;
    this.getRef('container').className = `grid-block-wrapper vue-file-agent file-input-wrapper
      ${!!this.$props.compact ? 'is-compact' : ''}
      ${!this.hasMultiple ? 'is-single' : ''}
      ${this.hasMultiple ? 'has-multiple' : ''}
      ${this.$props.meta === false ? 'no-meta' : ''}
    `;
  }

  getSlotContentParsed(slotContent: string | HTMLElement): HTMLElement {
    if (typeof slotContent === 'string') {
      const div = document.createElement('div');
      div.innerHTML = slotContent;
      if (div.children.length === 1) {
        return div.firstChild as HTMLElement;
      }
      return div;
    }
    return slotContent;
  }
  getSlotContent(slot: string) {
    if (!this.$props.slots) {
      return;
    }
    const slotContent: string | HTMLElement = (this.$props.slots as any)[slot];
    if (!slotContent) {
      return;
    }
    return this.getSlotContentParsed(slotContent);
  }

  insertSlot(slot: string) {
    const slotContent = this.getSlotContent(slot);
    if (!slotContent) {
      return;
    }
    const slotEl = this.getSlot(slot);
    slotEl.innerHTML = '';
    slotEl.appendChild(slotContent);
  }

  insertSlotBefore(ref: string | HTMLElement, slot: string) {
    return this.insertSlot(slot);
    // const slotContent = this.getSlotContent(slot);
    // if (!slotContent) {
    //   return;
    // }
    // const el = typeof ref === 'string' ? this.getRef(ref) : (ref as HTMLElement);
    // el.insertBefore(slotContent, el.firstChild);
  }

  insertSlotAfter(ref: string | HTMLElement, slot: string) {
    return this.insertSlot(slot);
    // const slotContent = this.getSlotContent(slot);
    // if (!slotContent) {
    //   return;
    // }
    // const el = typeof ref === 'string' ? this.getRef(ref) : (ref as HTMLElement);
    // el.appendChild(slotContent);
  }

  update() {
    this.updateWrapper();
    // const container = this.getRef('file-preview-wrapper-container');
    const container = this.getRef('file-preview-list');
    if (!(this as any).isAddedNewFilePreview) {
      // console.log('this.$props.fileRecords', this.$props.fileRecords);
      container.innerHTML = '';
      const slotContent = this.getSlotContent('filePreviewNew');
      if (slotContent) {
        container.appendChild(slotContent);
      } else {
        container.appendChild(newFilePreviewEl);
      }
      (this as any).isAddedNewFilePreview = true;
    }
    // const newFileElement = container.lastElementChild as HTMLElement;
    // const newFileElementFirst = newFileElement.getBoundingClientRect();
    const newFileChild = container.lastElementChild as HTMLElement;
    // const newFileElement = {
    //   rect: newFileChild.getBoundingClientRect(),
    //   child: newFileChild,
    // };
    this.getRef('help-text').innerText = this.helpTextComputed;

    this.insertSlotBefore(this.$el, 'beforeOuter');
    this.insertSlotBefore('container', 'beforeInner');
    this.insertSlotAfter('container', 'afterInner');
    this.insertSlotAfter(this.$el, 'afterOuter');
    let index = 0;
    const fileRecords = this.$props.fileRecords.concat([]).reverse();
    const newChildren: HTMLElement[] = [];
    // const otherElements: { rect: DOMRect; child: HTMLElement }[] = [];
    const otherChildren: HTMLElement[] = [];
    const childRects: { rect: DOMRect; child: HTMLElement }[] = [];
    // tslint:disable-next-line
    for (let i = 0; i < container.children.length; i++) {
      const child = container.children[i] as HTMLElement;
      childRects.push({ child, rect: child.getBoundingClientRect() });
    }
    for (const fileRecord of fileRecords) {
      let child = this.getChildForFileRecord(fileRecord) as HTMLElement;
      if (child) {
        if (container.firstChild) {
          container.insertBefore(child, container.firstChild);
        } else {
          container.appendChild(child);
        }
        // otherElements.push({ child, rect: child.getBoundingClientRect() });
        otherChildren.push(child);
        continue;
      }
      if (!child) {
        child = document.createElement('div');
      }
      child.className = 'file-preview-wrapper grid-box-item-for-transition grid-block';
      if (this.$props.slots?.filePreview) {
        const previewSlotContent = this.getSlotContentParsed(this.$props.slots.filePreview(fileRecord, index));
        child.appendChild(previewSlotContent);
      } else {
        // let filePreview: FilePreview = (fileRecord as any)._filePreview;
        let filePreview = this.getFilePreviewForFileRecord(fileRecord) as FilePreview;
        if (!filePreview) {
          console.log('new filePreview...');
          filePreview = new FilePreview({
            averageColor: this.$props.averageColor,
            deletable: this.$props.deletable,
            editable: this.$props.editable,
            linkable: this.$props.linkable,
            disabled: this.$props.disabled,
            fileRecord,
            onRename: (fr) => {
              this.onRenameFileRecord(fr);
            },
            onDelete: (fr) => {
              this.onDeleteFileRecord(fr);
            },
            // errorText: this.$props.errorText,
          });
          // (fileRecord as any)._filePreview = filePreview;
          fileRecord.onChange.progress = () => {
            filePreview.updateProgress();
          };
          fileRecord.onChange.name = () => {
            filePreview.updateName();
          };
          fileRecord.onChange.url = () => {
            filePreview.updateUrl();
          };
          fileRecord.onChange.thumbnail = () => {
            filePreview.updateThumbnail();
          };
          fileRecord.onChange.dimensions = () => {
            filePreview.updateDimensions();
          };
          fileRecord.onChange.error = () => {
            filePreview.updateError();
          };
          this.setFilePreviewForFileRecord(fileRecord, filePreview, child);
          newChildren.push(child);
        } else {
          console.log('EXISTING filePreview...');
          filePreview.updateWrapper();
          // filePreview.updateProgress();
          filePreview.updateError();
        }
        filePreview.render(child);
      }
      // animation:test:begin
      // setTimeout(() => {
      //   child.classList.remove('grid-box-enter');
      // }, 10);
      // animation:test:end
      if (container.firstChild) {
        container.insertBefore(child, container.firstChild);
      } else {
        container.appendChild(child);
      }
      index++;
    }
    // newFileElementFirst;
    const removedElements = this.cachedElements.filter((ch) => fileRecords.indexOf(ch.fileRecord) === -1);
    const removedChildren = removedElements.map((ch) => ch.child);
    const enableTransitions = true;
    if (!enableTransitions) {
      removedChildren.map((child) => container.removeChild(child));
    } else {
      // let displayValue = 'inline-block';
      // removedChildren.map((child) => {
      //   displayValue = child.style.display;
      //   child.style.display = 'none';
      // });

      // transitionManager.addElements(newChildren);
      // transitionManager.transformNewElement(newFileElement, newFileElementFirst);
      // removedChildren.map((child) => {
      //   child.style.position = 'absolute';
      //   child.style.display = displayValue;
      //   child.style.opacity = '0.25';
      // });
      // transitionManager.removeElements(removedChildren);
      const transitionManager = new TransitionManager(this.$props.theme);
      transitionManager.applyTransitions(
        newChildren,
        removedChildren,
        // otherElements.concat([newFileElement]),
        otherChildren.concat(newFileChild),
        childRects,
      );
    }

    // setTimeout(() => {
    // }, 1);
    // removedChildren.map((child) => container.removeChild(child));
    // const newEl = container.lastElementChild as HTMLElement;
    // const first = newEl.getBoundingClientRect();
    const removeElement = (ch: typeof removedElements[0]) => {
      return new Promise((resolve, reject) => {
        const removedChild = ch.filePreview.$el.parentElement;
        if (!removedChild) {
          return;
        }
        // console.log('removedChildremovedChild', removedChild, removedChild?.parentElement, ch.filePreview);
        // removedChild.classList.add('grid-box-leave-active');
        removedChild.classList.add('grid-box-leave-to');
        // setTimeout(() => {
        removedChild.addEventListener('transitionend', () => {
          removedChild?.parentElement?.removeChild(removedChild);
          resolve();
        });
        // }, 300);
        requestAnimationFrame(() => {
          // remove after 1 frame
          requestAnimationFrame(() => {
            // removedChild.classList.remove('grid-box-leave-to');
          });
        });
      });
    };
    // Promise.all(removedElements.map((ch) => removeElement(ch))).then(() => {
    //   requestAnimationFrame(() => {
    //     const last = newEl.getBoundingClientRect();
    //     console.log('ok complete2', first, last);
    //     // Invert.
    //     const transform = `translate3d(${first.left - last.left}px, ${first.top - last.top}px, 0)`;
    //     newEl.style.transform = transform;
    //     console.log('newEl.style.transform', transform);
    //     // Wait for the next frame so we
    //     // know all the style changes have
    //     // taken hold.
    //     requestAnimationFrame(() => {
    //       // Switch on animations.
    //       // newEl.classList.add('animate-on-transforms');
    //       // GO GO GOOOOOO!
    //       newEl.style.transform = '';
    //     });
    //   });
    //   // setTimeout(() => {
    //   // }, 100);

    //   // Capture the end with transitionend
    //   newEl.addEventListener('transitionend', () => {
    //     // newEl.style.transform = '';
    //     //
    //   });
    //   //
    // });
    this.cachedElements = this.cachedElements.filter((ch) => removedElements.indexOf(ch) === -1);
    const input = this.getRef<HTMLInputElement>('file-input');
    input.disabled = this.$props.disabled === true || (this.hasMultiple && !this.canAddMore);
    input.multiple = this.hasMultiple;
    input.accept = this.$props.accept || '*';
    if (this.$props.capture) {
      (input as any).capture = this.$props.capture;
    } else {
      delete (input as any).capture;
    }
    input.onchange = (event) => {
      this.filesChanged(event as InputEvent);
    };
  }

  get $el(): HTMLElement {
    if (this.cachedEl) {
      return this.cachedEl as HTMLElement;
    }
    // let el?: HTMLElement;
    // if (!el) {
    // const el = document.createElement('div');
    if (!fileAgentEl) {
      const templateString = template.replace(/\<icon name="(.+?)"><\/icon>/g, (match, name) => {
        return this.iconByName(name);
      });
      fileAgentEl = this.parseTemplate(templateString);
      newFilePreviewEl = this.getRef('file-preview-new', fileAgentEl);
    }
    const el = fileAgentEl.cloneNode(true) as HTMLElement;
    this.cachedEl = el; // important to avoid recursion because this getter is called in update method
    const uniqueId = new Date().getTime().toString(36) + Math.random().toString(36).slice(2);
    el.id = 'vfa-' + uniqueId;

    this.update();
    this.bindEvents();
    return el;
  }
}

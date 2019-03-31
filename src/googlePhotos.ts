import { AuthManager } from './authManager';
import * as fs from 'fs';
import * as path from 'path';
import { GaxiosOptions } from 'gaxios';
export class Photos {
  albums: Photos.Albums;
  mediaItems: Photos.MediaItems;
  private authManager: AuthManager;
  constructor(authManager: AuthManager) {
    this.authManager = authManager;
    this.albums = new Photos.Albums(authManager);
    this.mediaItems = new Photos.MediaItems(authManager);
  }
  async upload(filepath: string): Promise<string> {
    return this.authManager
      .request<string>({
        method: 'POST',
        url: 'https://photoslibrary.googleapis.com/v1/uploads',
        headers: {
          'Content-type': 'application/octet-stream',
          'X-Goog-Upload-File-Name': path.basename(filepath),
          'X-Goog-Upload-Protocol': 'raw',
        },
        data: fs.createReadStream(filepath),
        responseType: 'text',
        validateStatus: status => status >= 200 && status < 300,
      })
      .then(r => r.data);
  }
  async uploadAll(filepath: string[]): Promise<string[]> {
    return Promise.all(filepath.map(f => this.upload(f)));
  }
}
export namespace Photos {
  export interface SharedAlbumOptions {
    isCollaborative?: boolean;
    isCommentable?: boolean;
  }
  export interface ShareInfo {
    sharedAlbumOptions?: SharedAlbumOptions;
    shareableUrl?: string;
    shareToken?: string;
    isJoined?: boolean;
  }
  export interface Album {
    title: string;
  }
  export interface OutputonlyAlbum extends Album {
    id: string;
    productUrl: string;
    isWriteable?: boolean;
    shareInfo?: ShareInfo;
    mediaItemsCount: string;
    coverPhotoBaseUrl: string;
    coverPhotoMediaItemId: string;
  }
  export interface Photo {
    cameraMake?: string;
    cameraModel?: string;
    focalLength?: number;
    apertureFNumber?: number;
    isoEquivalent?: number;
    exposureTime?: string;
  }
  //ref: https://github.com/googleapis/google-api-go-client/blob/00684f929d85c4c6df3e30b2613cfcc4e5b33090/photoslibrary/v1/photoslibrary-gen.go#L1806-L1816
  //real data type of enum is string
  export type VideoProcessingStatus = 'UNSPECIFIED' | 'PROCESSING' | 'READY' | 'FAILED';
  export interface Video {
    cameraMake?: string;
    cameraModel?: string;
    fps?: number;
    status?: VideoProcessingStatus;
  }
  export interface MediaMetadata {
    creationTime?: string;
    width?: string;
    height?: string;
    // Union field metadata can be only one of the following:
    photo?: Photo;
    video?: Video;
    // End of list of possible types for union field metadata.
  }
  export interface ContributorInfo {
    profilePictureBaseUrl?: string;
    displayName?: string;
  }
  export interface MediaItem {
    id?: string;
    description?: string;
    productUrl?: string;
    baseUrl?: string;
    mimeType?: string;
    mediaMetadata?: MediaMetadata;
    contributorInfo?: ContributorInfo;
    filename?: string;
  }
  export interface Status {
    code?: number;
    message?: string;
    details?: object[];
  }
  export interface MediaItemResult {
    status?: Status;
    mediaItem?: MediaItem;
  }
  export interface NewMediaItemResult extends MediaItemResult {
    uploadToken?: string;
  }
  export type PositionType =
    | 'POSITION_TYPE_UNSPECIFIED'
    | 'FIRST_IN_ALBUM'
    | 'LAST_IN_ALBUM'
    | 'AFTER_MEDIA_ITEM'
    | 'AFTER_ENRICHMENT_ITEM';
  export interface AlbumPosition {
    position?: PositionType;
    relativeMediaItemId?: string;
    relativeEnrichmentItemId?: string;
  }
  export interface SimpleMediaItem {
    uploadToken: string;
  }
  export interface NewMediaItem {
    description?: string;
    simpleMediaItem: SimpleMediaItem;
  }
  export interface Date {
    year: number;
    month: number;
    day: number;
  }
  export interface DateRange {
    startDate: Date;
    endDate: Date;
  }
  export interface DateFilter {
    dates?: [Date, Date?, Date?, Date?, Date?];
    ranges?: [DateRange, DateRange?, DateRange?, DateRange?, DateRange?];
  }
  export type ContentCategory =
    | 'NONE'
    | 'LANDSCAPES'
    | 'RECEIPTS'
    | 'CITYSCAPES'
    | 'LANDMARKS'
    | 'SELFIES'
    | 'PEOPLE'
    | 'PETS'
    | 'WEDDINGS'
    | 'BIRTHDAYS'
    | 'DOCUMENTS'
    | 'TRAVEL'
    | 'ANIMALS'
    | 'FOOD'
    | 'SPORT'
    | 'NIGHT'
    | 'PERFORMANCES'
    | 'WHITEBOARDS'
    | 'SCREENSHOTS'
    | 'UTILITY';
  export interface ContentFilter {
    includedContentCategories?: [
      ContentCategory,
      ContentCategory?,
      ContentCategory?,
      ContentCategory?,
      ContentCategory?,
      ContentCategory?,
      ContentCategory?,
      ContentCategory?,
      ContentCategory?,
      ContentCategory?
    ];
    excludedContentCategories?: [
      ContentCategory,
      ContentCategory?,
      ContentCategory?,
      ContentCategory?,
      ContentCategory?,
      ContentCategory?,
      ContentCategory?,
      ContentCategory?,
      ContentCategory?,
      ContentCategory?
    ];
  }
  export type MediaType = 'ALL_MEDIA' | 'VIDEO' | 'PHOTO';
  export interface MediaTypeFilter {
    mediaTypes: MediaType;
  }
  export interface Filters {
    dateFilter?: DateFilter;
    contentFilter?: ContentFilter;
    mediaTypeFilter?: MediaTypeFilter;
    includeArchivedMedia?: boolean;
    excludeNonAppCreatedData?: boolean;
  }
  export class Albums {
    private authManager: AuthManager;
    constructor(authManager: AuthManager) {
      this.authManager = authManager;
    }
    async create(body: Albums.CreateBody) {
      return this.authManager
        .request<OutputonlyAlbum>({
          method: 'POST',
          url: 'https://photoslibrary.googleapis.com/v1/albums',
          validateStatus: status => status >= 200 && status < 300,
          body: JSON.stringify(body),
        })
        .then(a => a.data);
    }
    async listAll(excludeNonAppCreatedData: boolean = false): Promise<OutputonlyAlbum[]> {
      let re: OutputonlyAlbum[] = [];
      let responce: Albums.ListResponce;
      let opt: Albums.ListOptions = {
        method: 'GET',
        url: 'https://photoslibrary.googleapis.com/v1/albums',
        validateStatus: status => status >= 200 && status < 300,
        params: {
          pageSize: 50,
          excludeNonAppCreatedData: excludeNonAppCreatedData,
        },
      };
      while (true) {
        responce = await this.authManager.request<Albums.ListResponce>(opt).then(a => a.data);
        if (responce.albums && Array.isArray(responce.albums)) {
          re = [...re, ...responce.albums];
          if (responce.nextPageToken) {
            opt.params.pageToken = responce.nextPageToken;
          } else {
            break;
          }
        } else {
          return [];
        }
      }
      return re;
    }
  }
  export namespace Albums {
    export interface CreateBody {
      album: Album;
    }
    export interface ListResponce {
      albums?: OutputonlyAlbum[];
      nextPageToken?: string;
    }
    export interface ListParam {
      pageSize?: number;
      pageToken?: string;
      excludeNonAppCreatedData?: boolean;
    }
    export interface ListOptions extends GaxiosOptions {
      params: ListParam;
    }
  }
  export class MediaItems {
    private authManager: AuthManager;
    constructor(authManager: AuthManager) {
      this.authManager = authManager;
    }
    async batchCreate(body: Readonly<MediaItems.BatchCreateBody>): Promise<NewMediaItemResult[]> {
      return this.authManager
        .request<MediaItems.BatchCreateResponce>({
          method: 'POST',
          url: 'https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate',
          validateStatus: status => status >= 200 && status < 300,
          body: JSON.stringify(body),
        })
        .then(r => r.data.newMediaItemResults);
    }
    async batchGet(mediaItemIds: string[]): Promise<MediaItemResult[]> {
      return this.authManager
        .request<MediaItems.BatchGetResponce>({
          method: 'GET',
          url: 'https://photoslibrary.googleapis.com/v1/mediaItems:batchGet',
          validateStatus: status => status >= 200 && status < 300,
          params: {
            mediaItemIds: mediaItemIds,
          },
        })
        .then(r => r.data.mediaItemResults);
    }
    async searchAll(albumId: string): Promise<MediaItem[]>;
    async searchAll(filters: Filters): Promise<MediaItem[]>;
    async searchAll(b: string | Filters) {
      let re: MediaItem[] = [];
      let responce: MediaItems.SearchResponce;
      let opt: MediaItems.SearchOptions = {
        method: 'POST',
        url: 'https://photoslibrary.googleapis.com/v1/mediaItems:search',
        validateStatus: status => status >= 200 && status < 300,
        body: {
          pageSize: 100,
        },
      };
      if (opt.body) {
        if (typeof b === 'string') {
          opt.body.albumId = b;
        } else {
          opt.body.filters = b;
        }
      }
      while (true) {
        const o: GaxiosOptions = { ...opt };
        if (opt.body) {
          o.body = JSON.stringify(opt.body);
        }
        responce = await this.authManager.request<MediaItems.SearchResponce>(o).then(a => a.data);
        re = [...re, ...responce.mediaItems];
        if (responce.nextPageToken) {
          if (undefined === opt.body) {
            opt.body = {};
          }
          opt.body.pageToken = responce.nextPageToken;
        } else {
          break;
        }
      }
      return re;
    }
  }
  export namespace MediaItems {
    export interface BatchCreateBody {
      albumId?: string;
      newMediaItems: ReadonlyArray<NewMediaItem>;
      albumPosition?: AlbumPosition;
    }
    export interface BatchCreateResponce {
      newMediaItemResults: NewMediaItemResult[];
    }
    export interface BatchGetResponce {
      mediaItemResults: MediaItemResult[];
    }
    export interface SearchBody {
      albumId?: string;
      pageSize?: number;
      pageToken?: string;
      filters?: Readonly<Filters>;
    }
    export interface SearchOptions extends GaxiosOptions {
      body?: SearchBody;
    }
    export interface SearchResponce {
      mediaItems: MediaItem[];
      nextPageToken?: string;
    }
  }
}

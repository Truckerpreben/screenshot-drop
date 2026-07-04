export interface Destination {
  id: string;
  name: string;
  url: string;
  token: string;
}

export interface UploadResult {
  path: string;
  filename: string;
  bytes: number;
}

export type UploadErrorKind = 'auth' | 'network' | 'server' | 'bad-response';

export class UploadError extends Error {
  kind: UploadErrorKind;

  constructor(kind: UploadErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = 'UploadError';
  }
}

export interface Transport {
  upload(dest: Destination, png: Blob, shortname: string): Promise<UploadResult>;
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const isPlaceholder = (v) => !v || v.startsWith('YOUR_');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const hashtagText = (tags = []) => tags.map((t) => `#${t}`).join(' ');

export class PackageError extends Error {
  constructor(code, message, path = '') {
    super(message);
    this.name = 'PackageError';
    this.code = code;
    this.path = path;
  }
}

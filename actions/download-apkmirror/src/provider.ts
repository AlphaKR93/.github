export class ApkMirror {

  static BASE_URL: "https://www.apkmirror.com";

  private readonly __publisherId: string;
  private readonly __appCategory: string;
  private readonly __versionTemplate: string | null;

  constructor(
    publisherId: string,
    appCategory: string,
    versionTemplate?: string,
  ) {
    this.__publisherId = publisherId;
    this.__appCategory = appCategory;
    this.__versionTemplate = !versionTemplate ? null : versionTemplate; // INTENDED: Also handle empty string as null
  }

  public get listUrl(): string {
    return `${ApkMirror.BASE_URL}/uploads/?appcategory=${this.__appCategory}`;
  }

  public get versionHrefPrefix(): string {
    return `/apk/${this.__publisherId}/${this.__appCategory}/`;
  }

  public get hasVersionTemplate(): boolean {
    return Boolean(this.__versionTemplate);
  }

  public buildVersionPageUrl(version: string): string {
    const versionHref = this.__versionTemplate!.replace("{version}", version.replace('.', '-'));
    return `${ApkMirror.BASE_URL}${this.versionHrefPrefix}${versionHref}/`;
  }

}

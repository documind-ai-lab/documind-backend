export const OWNER_PROVIDER = Symbol("OWNER_PROVIDER");

export interface OwnerProvider {
  currentOwnerId(): string;
}

export class DemoOwnerProvider implements OwnerProvider {
  constructor(private readonly ownerId: string) {}

  currentOwnerId(): string {
    return this.ownerId;
  }
}

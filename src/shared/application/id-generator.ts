import { v7 as uuidv7 } from "uuid";

export const ID_GENERATOR = Symbol("ID_GENERATOR");

export interface IdGenerator {
  nextId(): string;
}

export class UuidV7Generator implements IdGenerator {
  nextId(): string {
    return uuidv7();
  }
}

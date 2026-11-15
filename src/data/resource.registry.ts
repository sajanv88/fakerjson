import { Injectable } from '@nestjs/common';
import type { AnyResource } from './resource.types.js';

export const RESOURCE_DEFINITIONS = Symbol('RESOURCE_DEFINITIONS');

@Injectable()
export class ResourceRegistry {
  private readonly byName: Map<string, AnyResource>;

  constructor(readonly all: readonly AnyResource[]) {
    this.byName = new Map(all.map((d) => [d.name, d]));
    this.assertConsistent();
  }

  get(name: string): AnyResource {
    const def = this.byName.get(name);
    if (!def) throw new Error(`Unknown resource "${name}"`);
    return def;
  }

  children(parent: string): AnyResource[] {
    return this.all.filter((d) => d.parent?.resource === parent);
  }

  private assertConsistent(): void {
    for (const def of this.all) {
      if (def.parent) {
        const parent = this.get(def.parent.resource);
        const expected = parent.count * def.parent.perParent;
        if (def.count !== expected) {
          throw new Error(
            `${def.name}.count (${def.count}) must equal ${parent.name}.count × perParent (${expected})`,
          );
        }
      }
      for (const rel of def.relations ?? []) this.get(rel.resource);
    }
  }
}

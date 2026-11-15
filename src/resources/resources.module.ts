import { type DynamicModule, Module } from '@nestjs/common';
import { DatasetService } from '../data/dataset.service.js';
import { ResourceRegistry } from '../data/resource.registry.js';
import type { AnyResource } from '../data/resource.types.js';
import { RESOURCES } from './index.js';
import { createResourceControllers } from './resource-controller.factory.js';

@Module({})
export class ResourcesModule {
  static register(resources: readonly AnyResource[] = RESOURCES): DynamicModule {
    return {
      module: ResourcesModule,
      global: true,
      controllers: resources.flatMap((def) => createResourceControllers(def, resources)),
      providers: [{ provide: ResourceRegistry, useValue: new ResourceRegistry(resources) }, DatasetService],
      exports: [ResourceRegistry, DatasetService],
    };
  }
}

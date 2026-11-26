import { Module } from '@nestjs/common';
import { G7Client } from './g7.client';
import { G7IntrospectionService } from './g7-introspection.service';

// No dependency on session persistence, CartModule or guards.
@Module({ providers: [G7Client, G7IntrospectionService], exports: [G7Client, G7IntrospectionService] })
export class G7IntegrationModule {}

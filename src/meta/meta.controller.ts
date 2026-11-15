import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { NodeRequest, NodeResponse } from '@nestjs/platform-node';
import { ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiProperty, ApiTags } from '@nestjs/swagger';
import { STATUS_CODES } from 'node:http';
import { ApiValidationException } from '../common/errors.js';
import { NoCache } from '../common/http-cache.interceptor.js';
import { ApiCommonProblems, ApiGlobalParams } from '../common/openapi.js';
import { type AppConfig, InjectConfig } from '../config/app-config.js';
import { LOCALE_CODES } from '../data/locales.js';
import { ResourceRegistry } from '../data/resource.registry.js';
import { tagOf } from '../resources/resource-controller.factory.js';
import { APP_VERSION } from '../version.js';

class ResourceSummary {
  @ApiProperty({ example: 'posts' }) name: string;
  @ApiProperty({ example: 'Classic' }) group: string;
  @ApiProperty({ example: 'Classic · Posts', description: 'Tag in the OpenAPI document.' }) tag: string;
  @ApiProperty({ example: 'Blog posts, ten per user.' }) description: string;
  @ApiProperty({ example: 1000 }) count: number;
  @ApiProperty({ example: '/v1/posts' }) href: string;
  @ApiProperty({ example: '/users/{userId}/posts', nullable: true, type: String }) nestedUnder: string | null;
}

class ApiIndex {
  @ApiProperty({ example: 'FakerJson' }) name: string;
  @ApiProperty({ example: '1.0.0' }) version: string;
  @ApiProperty({ example: 'https://fakerjson.com' }) home: string;
  @ApiProperty({ example: '/docs' }) docs: string;
  @ApiProperty({ example: '/openapi.json' }) openapi: string;
  @ApiProperty({ example: 42 }) defaultSeed: number;
  @ApiProperty({ example: LOCALE_CODES }) locales: string[];
  @ApiProperty({ type: [ResourceSummary] }) resources: ResourceSummary[];
}

class EchoResponse {
  @ApiProperty({ example: 'POST' }) method: string;
  @ApiProperty({ example: '/v1/echo' }) path: string;
  @ApiProperty({ example: { foo: 'bar' } }) query: Record<string, unknown>;
  @ApiProperty({ example: { 'content-type': 'application/json' } }) headers: Record<string, unknown>;
  @ApiProperty({ example: { hello: 'world' }, nullable: true }) body: unknown;
  @ApiProperty({ example: '203.0.113.7' }) ip: string;
}


/**
 * Headers whose values are never echoed: the usual names plus anything that looks like a
 * credential (x-auth-token, x-session-id, x-hub-signature, ...).
 */
const CREDENTIAL_HEADER =
  /(^|-)(authorization|auth|token|secret|credentials?|api-?key|apikey|session|cookie|password|passwd|signature|jwt|bearer)(-|$)/;
const isCredentialHeader = (name: string) => CREDENTIAL_HEADER.test(name.toLowerCase());

/** `GET /v1`: the API's machine-readable index. The site itself is served at `/`. */
@ApiTags('Meta')
@Controller({ version: '1' })
export class IndexController {
  constructor(
    private readonly registry: ResourceRegistry,
    @InjectConfig() private readonly config: AppConfig,
  ) {}

  @Get()
  @ApiOperation({ operationId: 'getIndex', summary: 'API index: every resource with its link and size' })
  @ApiOkResponse({ type: ApiIndex })
  index(): ApiIndex {
    return {
      name: 'FakerJson',
      version: APP_VERSION,
      home: 'https://fakerjson.com',
      docs: '/docs',
      openapi: '/openapi.json',
      defaultSeed: this.config.DEFAULT_SEED,
      locales: LOCALE_CODES,
      resources: this.registry.all.map((d) => {
        const parent = d.parent && this.registry.get(d.parent.resource);
        return {
          name: d.name,
          group: d.group,
          tag: tagOf(d),
          description: d.description,
          count: d.count,
          href: `/v1/${d.name}`,
          nestedUnder: parent ? `/v1/${parent.name}/{${parent.singular}Id}/${d.name}` : null,
        };
      }),
    };
  }
}

@ApiTags('Utilities')
@ApiCommonProblems()
@NoCache()
@Controller({ version: '1' })
export class UtilitiesController {
  @Get('status/:code')
  @ApiOperation({
    operationId: 'getStatus',
    summary: 'Respond with any HTTP status',
    description: 'Returns the given status (200–599). Codes ≥ 400 return an RFC 9457 problem document, like real errors.',
  })
  @ApiParam({ name: 'code', schema: { type: 'integer', minimum: 200, maximum: 599, example: 503 } })
  @ApiGlobalParams()
  getStatus(@Param('code') code: string, @Res() res: NodeResponse) {
    return this.status(code, res);
  }

  @Post('status/:code')
  @ApiOperation({ operationId: 'postStatus', summary: 'Respond with any HTTP status (POST)' })
  @ApiParam({ name: 'code', schema: { type: 'integer', minimum: 200, maximum: 599, example: 422 } })
  @ApiGlobalParams()
  postStatus(@Param('code') code: string, @Res() res: NodeResponse) {
    return this.status(code, res);
  }

  @Get('echo')
  @ApiOperation({ operationId: 'echoGet', summary: 'Echo the request back', description: 'Shows the method, path, query, headers and client IP the server received.' })
  @ApiGlobalParams()
  @ApiOkResponse({ type: EchoResponse })
  echoGet(@Req() req: NodeRequest): EchoResponse {
    return this.echo(req, null);
  }

  @Post('echo')
  @ApiOperation({ operationId: 'echoPost', summary: 'Echo the request (with body) back' })
  @ApiBody({ schema: { type: 'object', additionalProperties: true, example: { hello: 'world' } } })
  @ApiGlobalParams()
  @ApiOkResponse({ type: EchoResponse })
  echoPost(@Req() req: NodeRequest, @Body() body: unknown): EchoResponse {
    return this.echo(req, body ?? null);
  }

  private status(raw: string, res: NodeResponse): void {
    const code = Number(raw);
    if (!/^\d{3}$/.test(raw) || code < 200 || code > 599) {
      throw new ApiValidationException([{ field: 'code', message: 'must be an HTTP status between 200 and 599' }]);
    }
    if (code >= 400) throw new HttpException(`Responded with ${code} because you asked for it.`, code);
    res.statusCode = code;
    if (code === HttpStatus.NO_CONTENT || code === 304) {
      res.end();
      return;
    }
    res.json({ status: code, description: STATUS_CODES[code] ?? 'Unknown' });
  }

  private echo(req: NodeRequest, body: unknown): EchoResponse {
    const [path = '/'] = (req.url ?? '/').split('?');
    // Show that a credential arrived, never its value.
    const headers: Record<string, unknown> = { ...req.headers };
    for (const name of Object.keys(headers)) if (isCredentialHeader(name)) headers[name] = '[redacted]';
    return {
      method: req.method ?? 'GET',
      path,
      query: { ...(req.query as Record<string, unknown>) },
      headers,
      body,
      ip: req.ip ?? '',
    };
  }
}

import type { Express, RequestHandler } from 'express';
import type { Role } from '@vtmp/shared';
import { authenticate } from '../src/core/auth';

/** One endpoint of the app and the access checks on its path (Express 4 internals). */
export interface RouteInfo {
  method: string;
  path: string;
  authenticated: boolean;
  /** Roles allowed by authorize(); null when any signed-in user may call it. */
  roles: Role[] | null;
}

interface Layer {
  handle: RequestHandler & { stack?: Layer[]; allowedRoles?: Role[] };
  regexp: RegExp & { fast_slash?: boolean };
  keys: Array<{ name: string }>;
  route?: {
    path: string | string[];
    methods: Record<string, boolean>;
    stack: Layer[];
  };
}

/** The mount path of a router layer, rebuilt from its regexp ('' for the root). */
function mountPath(layer: Layer): string {
  if (layer.regexp.fast_slash) return '';
  let i = 0;
  return layer.regexp.source
    .replace(/^\^/, '')
    .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
    .replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/g, () => `:${layer.keys[i++]!.name}`)
    .replace(/\\\//g, '/');
}

interface Checks {
  authenticated: boolean;
  roles: Role[] | null;
}

function apply(checks: Checks, handlers: Layer[]): Checks {
  let { authenticated, roles } = checks;
  for (const h of handlers) {
    if (h.handle === authenticate) authenticated = true;
    const allowed = h.handle.allowedRoles;
    if (allowed) roles = roles ? roles.filter((r) => allowed.includes(r)) : [...allowed];
  }
  return { authenticated, roles };
}

function walk(stack: Layer[], prefix: string, inherited: Checks, out: RouteInfo[]) {
  // Root-level router.use(authenticate, authorize(...)) applies to the routes after it.
  let checks = inherited;
  for (const layer of stack) {
    if (layer.route) {
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      const own = apply(checks, layer.route.stack);
      for (const p of paths) {
        for (const method of Object.keys(layer.route.methods)) {
          if (method === '_all') continue;
          out.push({
            method: method.toUpperCase(),
            path: `${prefix}${p}`.replace(/\/$/, '') || '/',
            ...own,
          });
        }
      }
    } else if (layer.handle.stack) {
      walk(layer.handle.stack, `${prefix}${mountPath(layer)}`, checks, out);
    } else if (layer.regexp.fast_slash) {
      checks = apply(checks, [layer]);
    }
  }
}

/** Every route the app serves, with whether it authenticates and which roles it allows. */
export function listRoutes(app: Express): RouteInfo[] {
  const router = (app as unknown as { _router: { stack: Layer[] } })._router;
  const out: RouteInfo[] = [];
  walk(router.stack, '', { authenticated: false, roles: null }, out);
  return out;
}

/** Fills :params with the given values (a random-looking UUID by default). */
export function fillPath(path: string, values: Record<string, string> = {}): string {
  return path.replace(
    /:(\w+)/g,
    (_m, name: string) => values[name] ?? '00000000-0000-4000-8000-000000000000',
  );
}

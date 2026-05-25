type MethodHandlers = Partial<
  Record<string, (req: unknown) => Response | Promise<Response>>
>;

function pathToRegex(path: string): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  const regexStr = path.replace(/:([^/]+)/g, (_, name) => {
    paramNames.push(name);
    return "([^/]+)";
  });
  return { regex: new RegExp(`^${regexStr}$`), paramNames };
}

function matchRoute(
  pathname: string,
  routePath: string
): Record<string, string> | null {
  const { regex, paramNames } = pathToRegex(routePath);
  const match = pathname.match(regex);
  if (!match) return null;
  const params: Record<string, string> = {};
  paramNames.forEach((name, i) => {
    params[name] = match[i + 1] ?? "";
  });
  return params;
}

export function createRouter(
  routes: Record<string, MethodHandlers>
): (req: Request) => Promise<Response | null> {
  const entries = Object.entries(routes).sort(
    (a, b) => b[0].length - a[0].length
  );

  return async (req: Request): Promise<Response | null> => {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const method = req.method.toUpperCase();

    for (const [path, handlers] of entries) {
      const params = matchRoute(pathname, path);
      if (params === null) continue;

      const handler = handlers[method];
      if (!handler) continue;

      const reqWithParams = Object.assign(req, { params }) as Request & {
        params: Record<string, string>;
      };
      return handler(reqWithParams);
    }
    return null;
  };
}

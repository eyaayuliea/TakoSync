export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/[./]$|\.[a-z]+$/i.test(specifier)) {
    try {
      return await nextResolve(`${specifier}.ts`, context, nextResolve);
    } catch {
      // Let Node report the original resolution error when no TypeScript module exists.
    }
  }
  return nextResolve(specifier, context, nextResolve);
}

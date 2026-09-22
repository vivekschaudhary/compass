// `mammoth` ships no types and has no `@types` package.
//
// Declared to the narrow surface `uploads.ts` actually uses rather than reached for through `any`:
// a wrong assumption about this API should fail at the build, not at the moment somebody uploads a
// contract.
declare module "mammoth" {
  export function convertToHtml(
    input: { buffer: Buffer } | { path: string },
  ): Promise<{ value: string; messages: { type: string; message: string }[] }>;
}

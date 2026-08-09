import fs from 'fs';
import path from 'path';

const sourceRoot = path.resolve(__dirname, '../..');

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.ts') ? [fullPath] : [];
  });
}

describe('AI provider boundary', () => {
  test('application workflows do not import provider SDKs or adapters directly', () => {
    const allowed = new Set([
      path.resolve(__dirname, 'ai-gateway.service.ts'),
      path.resolve(__dirname, 'anthropic.service.ts'),
      path.resolve(sourceRoot, 'routes/voice.ts'),
      path.resolve(sourceRoot, 'services/memory/EmbeddingService.ts'),
    ]);
    const violations = sourceFiles(sourceRoot)
      .filter((file) => !allowed.has(file) && !file.endsWith('.test.ts'))
      .filter((file) => {
        const source = fs.readFileSync(file, 'utf8');
        return /from ['"]openai['"]|anthropic\.service|anthropicService|ClaudeModel/.test(source);
      })
      .map((file) => path.relative(sourceRoot, file));

    expect(violations).toEqual([]);
  });
});

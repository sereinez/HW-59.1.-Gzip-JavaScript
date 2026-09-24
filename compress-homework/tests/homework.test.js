import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { compressFile, decompressFile, FileOperationError } from '../homework.js';

let dir;
let source;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gzip-test-'));
  source = path.join(dir, 'source.txt');
  await fs.writeFile(source, 'hello gzip '.repeat(100));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('compressFile', () => {
  test('creates <name>.gz and returns its path', async () => {
    const result = await compressFile(source);
    expect(result).toBe(`${source}.gz`);
    await expect(fs.stat(result)).resolves.toBeDefined();
  });

  test('adds a number when the .gz file already exists', async () => {
    const first = await compressFile(source);
    const second = await compressFile(source);
    const third = await compressFile(source);
    expect(first).toBe(`${source}.gz`);
    expect(second).toBe(path.join(dir, 'source.txt_1.gz'));
    expect(third).toBe(path.join(dir, 'source.txt_2.gz'));
  });

  test('FILE_NOT_FOUND for a missing file', async () => {
    await expect(compressFile(path.join(dir, 'nope.txt'))).rejects.toMatchObject({
      name: 'FileOperationError',
      code: 'FILE_NOT_FOUND',
    });
  });

  test('NOT_A_FILE for a directory', async () => {
    await expect(compressFile(dir)).rejects.toMatchObject({ code: 'NOT_A_FILE' });
  });

  test('INVALID_ARGUMENT for an empty path', async () => {
    await expect(compressFile('')).rejects.toBeInstanceOf(FileOperationError);
    await expect(compressFile('')).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });
});

describe('decompressFile', () => {
  test('restores the original content', async () => {
    const gz = await compressFile(source);
    const out = await decompressFile(gz, path.join(dir, 'restored.txt'));
    expect(await fs.readFile(out, 'utf8')).toBe(await fs.readFile(source, 'utf8'));
  });

  test('adds a number when the destination already exists', async () => {
    const gz = await compressFile(source);
    const dest = path.join(dir, 'restored.txt');
    const first = await decompressFile(gz, dest);
    const second = await decompressFile(gz, dest);
    expect(first).toBe(dest);
    expect(second).toBe(path.join(dir, 'restored_1.txt'));
  });

  test('creates missing destination directories', async () => {
    const gz = await compressFile(source);
    const out = await decompressFile(gz, path.join(dir, 'a', 'b', 'restored.txt'));
    await expect(fs.stat(out)).resolves.toBeDefined();
  });

  test('INVALID_GZIP for a non-gzip file and no leftover output', async () => {
    const dest = path.join(dir, 'bad.txt');
    await expect(decompressFile(source, dest)).rejects.toMatchObject({ code: 'INVALID_GZIP' });
    await expect(fs.stat(dest)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('INVALID_ARGUMENT for an empty destination', async () => {
    const gz = await compressFile(source);
    await expect(decompressFile(gz, '')).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });
});

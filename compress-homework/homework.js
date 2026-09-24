import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';

/**
 * Помилка файлових операцій із машинозчитуваним кодом.
 * Коди: FILE_NOT_FOUND, ACCESS_DENIED, NOT_A_FILE, INVALID_GZIP, IO_ERROR, INVALID_ARGUMENT.
 */
class FileOperationError extends Error {
  constructor(code, message, cause) {
    super(message, { cause });
    this.name = 'FileOperationError';
    this.code = code;
  }
}

/** Перетворює системну помилку Node.js на FileOperationError. */
function toFileOperationError(error, action) {
  if (error instanceof FileOperationError) return error;

  const map = {
    ENOENT: ['FILE_NOT_FOUND', 'Файл або директорію не знайдено'],
    EACCES: ['ACCESS_DENIED', 'Немає доступу до файлу'],
    EPERM: ['ACCESS_DENIED', 'Операцію заборонено'],
    EISDIR: ['NOT_A_FILE', 'Очікувався файл, а не директорія'],
    Z_DATA_ERROR: ['INVALID_GZIP', 'Файл пошкоджений або не є Gzip-архівом'],
    Z_BUF_ERROR: ['INVALID_GZIP', 'Gzip-архів обірваний (неповний)'],
  };

  const [code, text] = map[error.code] ?? ['IO_ERROR', error.message];
  return new FileOperationError(code, `${action}: ${text}`, error);
}

/** Перевіряє, що шлях існує і є файлом. */
async function assertIsFile(filePath) {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw new FileOperationError('INVALID_ARGUMENT', 'Шлях має бути непорожнім рядком');
  }
  const stats = await fs.stat(filePath);
  if (!stats.isFile()) {
    throw new FileOperationError('NOT_A_FILE', `"${filePath}" не є файлом`);
  }
}

/**
 * Атомарно створює файл з унікальним іменем.
 * Якщо `target` вже існує, додає номер: `name.ext` -> `name_1.ext`, `name_2.ext`, ...
 * Прапорець 'wx' гарантує, що існуючий файл ніколи не буде перезаписано,
 * навіть якщо інший процес створив його між перевіркою і записом.
 *
 * @param {string} target - бажаний шлях
 * @returns {Promise<{ handle: import('node:fs/promises').FileHandle, filePath: string }>}
 */
async function createUniqueFile(target) {
  const { dir, name, ext } = path.parse(target);

  for (let attempt = 0; ; attempt++) {
    const candidate = attempt === 0 ? target : path.join(dir, `${name}_${attempt}${ext}`);
    try {
      const handle = await fs.open(candidate, 'wx');
      return { handle, filePath: candidate };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
}

/**
 * Спільна логіка: читає source, пропускає через transform і пише в унікальний файл.
 * Якщо щось пішло не так, частково записаний файл видаляється.
 */
async function processFile(sourcePath, targetPath, createTransform, action) {
  let created;
  try {
    await assertIsFile(sourcePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    created = await createUniqueFile(targetPath);
    await pipeline(
      createReadStream(sourcePath),
      createTransform(),
      created.handle.createWriteStream()
    );
    return created.filePath;
  } catch (error) {
    if (created) {
      await fs.rm(created.filePath, { force: true }).catch(() => {});
    }
    throw toFileOperationError(error, action);
  }
}

/**
 * Стискає файл алгоритмом Gzip.
 * Результат зберігається поруч з оригіналом як `<ім'я>.gz`; якщо такий файл уже є,
 * створюється `<ім'я>_1.gz`, `<ім'я>_2.gz` тощо.
 *
 * @param {string} filePath - шлях до файлу, який треба стиснути
 * @returns {Promise<string>} шлях до створеного .gz файлу
 * @throws {FileOperationError} коди: INVALID_ARGUMENT, FILE_NOT_FOUND, ACCESS_DENIED, NOT_A_FILE, IO_ERROR
 *
 * @example
 * const gzPath = await compressFile('./files/source.txt');
 * // './files/source.txt.gz'
 */
async function compressFile(filePath) {
  return processFile(filePath, `${filePath}.gz`, createGzip, 'Помилка стиснення');
}

/**
 * Розпаковує Gzip-файл у вказане місце.
 * Якщо файл за `destinationFilePath` уже існує, додається номер: `name_1.ext`, `name_2.ext`, ...
 * Відсутні директорії у шляху призначення створюються автоматично.
 *
 * @param {string} compressedFilePath - шлях до .gz файлу
 * @param {string} destinationFilePath - бажаний шлях розпакованого файлу
 * @returns {Promise<string>} фактичний шлях розпакованого файлу
 * @throws {FileOperationError} коди: INVALID_ARGUMENT, FILE_NOT_FOUND, ACCESS_DENIED, NOT_A_FILE, INVALID_GZIP, IO_ERROR
 *
 * @example
 * const out = await decompressFile('./files/source.txt.gz', './files/source_decompressed.txt');
 */
async function decompressFile(compressedFilePath, destinationFilePath) {
  if (typeof destinationFilePath !== 'string' || destinationFilePath.trim() === '') {
    throw new FileOperationError('INVALID_ARGUMENT', 'Шлях призначення має бути непорожнім рядком');
  }
  return processFile(compressedFilePath, destinationFilePath, createGunzip, 'Помилка розпакування');
}

export { compressFile, decompressFile, FileOperationError };

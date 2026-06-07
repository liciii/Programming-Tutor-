import { readFile } from 'fs/promises';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _require = createRequire(import.meta.url);

export const UPLOAD_DIR = join(__dirname, '../data/uploads');

// per-file character cap (~3,750 tokens) total cap across all files (~10,000 tokens)
const MAX_CHARS_PER_FILE  = 15_000;
const MAX_TOTAL_CHARS     = 40_000;
// only base64-encode images under this size to avoid blowing out API request sizes
const MAX_IMAGE_BYTES     = 1.5 * 1024 * 1024;
const MAX_IMAGES          = 3;

const TEXT_MIMES = new Set([
  'text/plain', 'text/markdown', 'text/x-markdown',
  'text/csv', 'application/json',
]);
const IMAGE_MIMES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
]);

// maps file extension to the language identifier 
// giving the LLM an explicit language tag improves syntax comprehension
const LANGUAGE_MAP = {
  '.c': 'c',        '.h': 'c',        '.cpp': 'cpp',    '.cc': 'cpp',
  '.cxx': 'cpp',    '.hpp': 'cpp',    '.cs': 'csharp',  '.go': 'go',
  '.rs': 'rust',    '.swift': 'swift','.java': 'java',  '.kt': 'kotlin',
  '.kts': 'kotlin', '.scala': 'scala','.groovy': 'groovy',
  '.py': 'python',  '.rb': 'ruby',    '.php': 'php',
  '.pl': 'prolog',  '.pro': 'prolog', '.lua': 'lua',
  '.js': 'javascript', '.mjs': 'javascript', '.ts': 'typescript',
  '.jsx': 'jsx',    '.tsx': 'tsx',    '.vue': 'vue',    '.svelte': 'svelte',
  '.html': 'html',  '.htm': 'html',   '.css': 'css',
  '.scss': 'scss',  '.sass': 'sass',  '.less': 'less',
  '.sh': 'bash',    '.bash': 'bash',  '.zsh': 'zsh',    '.fish': 'fish',
  '.sql': 'sql',    '.r': 'r',        '.hs': 'haskell',
  '.ex': 'elixir',  '.exs': 'elixir', '.erl': 'erlang',
  '.ml': 'ocaml',   '.mli': 'ocaml',  '.m': 'matlab',
  '.f': 'fortran',  '.f90': 'fortran', '.f95': 'fortran',
  '.xml': 'xml',    '.yaml': 'yaml',  '.yml': 'yaml',   '.toml': 'toml',
  '.json': 'json',  '.md': 'markdown',
};

async function extractPdfText(diskPath) {
  let pdfParse;
  try {
    pdfParse = _require('pdf-parse');
  } catch {
    return '[PDF content unavailable: pdf-parse not installed]';
  }
  const buffer = await readFile(diskPath);
  const { text } = await pdfParse(buffer);
  return text.trim();
}

function truncate(text, limit, label) {
  if (text.length <= limit) return text;
  const omitted = text.length - limit;
  return text.slice(0, limit) + `\n... [${omitted} characters omitted from ${label}]`;
}

/**
 * reads the actual content of a user's uploaded files.
 *
 * reutrns object with 
 *   textContext  - markdown string ready to append to the system prompt
 *   imageFiles   - array of { name, mimeType, base64 } for multimodal injection
 *
 * skips unreadable or oversized files; a missing file should never
 * crash a tutoring request
 */
export async function buildFileContext(files) {
  const textParts  = [];
  const imageFiles = [];
  let totalChars   = 0;

  for (const file of files) {
    const diskPath = join(UPLOAD_DIR, file.id);

    try {
      if (TEXT_MIMES.has(file.mimeType)) {
        let content = await readFile(diskPath, 'utf-8');
        content = truncate(content, MAX_CHARS_PER_FILE, file.name);

        const remaining = MAX_TOTAL_CHARS - totalChars;
        if (remaining < 200) break;
        if (content.length > remaining) {
          content = truncate(content, remaining, 'total context limit');
        }

        const lang = LANGUAGE_MAP[extname(file.name).toLowerCase()] ?? '';
        textParts.push(`### ${file.name}\n\`\`\`${lang}\n${content}\n\`\`\``);
        totalChars += content.length;

      } else if (file.mimeType === 'application/pdf') {
        let content = await extractPdfText(diskPath);
        content = truncate(content, MAX_CHARS_PER_FILE, file.name);

        const remaining = MAX_TOTAL_CHARS - totalChars;
        if (remaining < 200) break;
        if (content.length > remaining) {
          content = truncate(content, remaining, 'total context limit');
        }

        textParts.push(`### ${file.name} (PDF)\n${content}`);
        totalChars += content.length;

      } else if (IMAGE_MIMES.has(file.mimeType) && imageFiles.length < MAX_IMAGES) {
        if (file.size <= MAX_IMAGE_BYTES) {
          const buffer = await readFile(diskPath);
          imageFiles.push({ name: file.name, mimeType: file.mimeType, base64: buffer.toString('base64') });
        }
        // images over MAX_IMAGE_BYTES fall back to metadata-only, no error needed
      }
      // office files (PPT/PPTX): binary format, no extraction yet metadata onl

    } catch (err) {
      console.error(`[fileContent] Could not read "${file.name}":`, err.message);
    }
  }

  const textContext = textParts.length > 0
    ? `\n\n## Student's Uploaded Files\n\nUse the contents of these files when answering the student's questions.\n\n${textParts.join('\n\n')}`
    : '';

  return { textContext, imageFiles };
}

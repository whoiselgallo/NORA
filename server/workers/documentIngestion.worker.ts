import fs from 'fs';
import { Worker, Job, Queue } from 'bullmq';
import { Pool, PoolClient } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { EmbeddingService } from '../services/embedding.service';

export interface DocumentIngestionJobData {
  documentId: string;
  workspaceId: string;
  projectId?: string | null;
  filename: string;
  mimeType: string;
  storagePath: string;
}

export function createDocumentIngestionQueue(redisUrl?: string): Queue<DocumentIngestionJobData> {
  const connectionUrl = redisUrl || process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  return new Queue<DocumentIngestionJobData>('nexus-doc-ingestion-queue', {
    connection: { url: connectionUrl },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: true,
      removeOnFail: false
    }
  });
}

export function createDocumentIngestionWorker(
  pool: Pool,
  io?: SocketIOServer,
  redisUrl?: string
) {
  const connectionUrl = redisUrl || process.env.REDIS_URL || 'redis://127.0.0.1:6379';

  return new Worker<DocumentIngestionJobData>(
    'nexus-doc-ingestion-queue',
    async (job: Job<DocumentIngestionJobData>) => {
      const { documentId, workspaceId, projectId, filename, mimeType, storagePath } = job.data;
      const client: PoolClient = await pool.connect();

      try {
        await client.query(
          `UPDATE workspace_documents
           SET parsing_status = 'PARSING', updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [documentId]
        );

        // 1. Extraer texto del documento según formato
        const rawContent = await extractDocumentText(storagePath, mimeType);
        if (!rawContent || rawContent.trim().length === 0) {
          throw new Error('No se pudo extraer contenido textual del archivo.');
        }

        // 2. Chunking semántico (~1000 tokens con 200 tokens de solapamiento)
        // 1 token ≈ 4 caracteres en inglés/español
        const chunkSize = 3600;
        const overlap = 700;
        const chunks = splitIntoSemanticChunks(rawContent, chunkSize, overlap);

        // 3. Vectorización de cada bloque a 1536 dimensiones e inserción en PostgreSQL
        for (let i = 0; i < chunks.length; i++) {
          const chunkText = chunks[i];
          const embedding = await EmbeddingService.getEmbedding(chunkText);
          const pgVectorStr = EmbeddingService.toPgVectorString(embedding);

          const metadata = {
            filename,
            mimeType,
            chunkIndex: i + 1,
            totalChunks: chunks.length,
            indexedAt: new Date().toISOString()
          };

          await client.query(
            `INSERT INTO nexus_knowledge_vectors (
               workspace_id, project_id, document_id, knowledge_domain,
               title, raw_content, metadata, embedding, chunk_index
             ) VALUES ($1, $2, $3, 'DOCUMENT_INGESTION', $4, $5, $6, $7::vector, $8)`,
            [
              workspaceId,
              projectId || null,
              documentId,
              `Doc: ${filename} (Parte ${i + 1}/${chunks.length})`,
              chunkText,
              JSON.stringify(metadata),
              pgVectorStr,
              i + 1
            ]
          );
        }

        // 4. Actualizar estado a INDEXED
        await client.query(
          `UPDATE workspace_documents
           SET parsing_status = 'INDEXED',
               total_chunks = $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [chunks.length, documentId]
        );

        // 5. Emitir notificación WebSocket a la sala de workspace
        if (io) {
          io.to(`workspace_${workspaceId}`).emit('DOCUMENT_INDEXED', {
            documentId,
            filename,
            totalChunks: chunks.length,
            status: 'INDEXED',
            timestamp: new Date().toISOString()
          });
        }

        return { documentId, totalChunks: chunks.length, status: 'INDEXED' };
      } catch (err: unknown) {
        const errorMsg = (err as Error).message;
        await client.query(
          `UPDATE workspace_documents
           SET parsing_status = 'FAILED',
               error_message = $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [errorMsg, documentId]
        );
        throw err;
      } finally {
        client.release();
      }
    },
    {
      connection: { url: connectionUrl },
      concurrency: 3
    }
  );
}

/**
 * Extracción de texto según tipo MIME o estructura de archivo
 */
export async function extractDocumentText(filePath: string, mimeType: string): Promise<string> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Archivo no encontrado en ruta de almacenamiento: ${filePath}`);
  }

  const buffer = fs.readFileSync(filePath);

  // Archivos de texto plano, Markdown, JSON, YAML
  if (
    mimeType.includes('text') ||
    mimeType.includes('markdown') ||
    mimeType.includes('json') ||
    mimeType.includes('yaml') ||
    filePath.endsWith('.md') ||
    filePath.endsWith('.txt') ||
    filePath.endsWith('.json') ||
    filePath.endsWith('.yaml') ||
    filePath.endsWith('.yml')
  ) {
    return buffer.toString('utf-8');
  }

  // Archivos DOCX (extracción nativa de XML w:t sin dependencias binarias pesadas)
  if (mimeType.includes('word') || filePath.endsWith('.docx')) {
    const rawStr = buffer.toString('binary');
    const textMatches = rawStr.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
    if (textMatches && textMatches.length > 0) {
      return textMatches.map(m => m.replace(/<[^>]+>/g, '')).join(' ');
    }
    // Fallback de strings limpios
    return buffer.toString('utf-8').replace(/[^\x20-\x7E\xC0-\xFF\n\r\t]/g, ' ');
  }

  // Archivos PDF (extracción de bloques de texto / streams de fuentes y contenido)
  if (mimeType.includes('pdf') || filePath.endsWith('.pdf')) {
    const rawPdf = buffer.toString('latin1');
    const textBlocks: string[] = [];
    // Captura de bloques de texto entre BT ... ET en especificación PDF
    const btRegex = /BT[\s\S]*?ET/g;
    let match;
    while ((match = btRegex.exec(rawPdf)) !== null) {
      const tjMatches = match[0].match(/\((.*?)\)\s*Tj/g);
      if (tjMatches) {
        const text = tjMatches.map(t => t.replace(/^[^(]*\((.*)\)[^)]*$/, '$1')).join(' ');
        textBlocks.push(text);
      }
    }

    if (textBlocks.length > 0) {
      return textBlocks.join('\n\n');
    }

    // Fallback de texto legible
    return buffer.toString('utf-8').replace(/[^\x20-\x7E\xC0-\xFF\n\r\t]/g, ' ');
  }

  return buffer.toString('utf-8');
}

/**
 * División semántica por párrafos y secciones con solapamiento
 */
export function splitIntoSemanticChunks(text: string, chunkSize: number, overlap: number): string[] {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const para of paragraphs) {
    if ((currentChunk + '\n\n' + para).length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      // Mantener solapamiento de los últimos caracteres
      const sliceStart = Math.max(0, currentChunk.length - overlap);
      currentChunk = currentChunk.substring(sliceStart) + '\n\n' + para;
    } else {
      currentChunk = currentChunk.length > 0 ? `${currentChunk}\n\n${para}` : para;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [text.substring(0, chunkSize)];
}

import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { withWorkspaceClient } from '../middleware/workspace.middleware';

export interface WorkspaceNote {
  id: string;
  workspace_id: string;
  author_id?: string | null;
  title: string;
  content: string;
  tags: string[];
  is_pinned: boolean;
  created_at?: string;
  updated_at?: string;
  author_name?: string;
}

export class NotesService {
  constructor(private pool: Pool, private io: SocketIOServer) {}

  public async getNotes(workspaceId: string): Promise<WorkspaceNote[]> {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const res = await client.query(
        `SELECT wn.*, u.name as author_name, u.email as author_email
         FROM workspace_notes wn
         LEFT JOIN users u ON wn.author_id = u.id
         WHERE wn.workspace_id = $1
         ORDER BY wn.is_pinned DESC, wn.updated_at DESC`,
        [workspaceId]
      );
      return res.rows;
    });
  }

  public async createNote(
    workspaceId: string,
    authorId: string | null,
    data: { title: string; content?: string; tags?: string[]; is_pinned?: boolean }
  ): Promise<WorkspaceNote> {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const res = await client.query(
        `INSERT INTO workspace_notes (workspace_id, author_id, title, content, tags, is_pinned)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          workspaceId,
          authorId,
          data.title,
          data.content || '',
          data.tags || [],
          data.is_pinned || false
        ]
      );

      const note = res.rows[0];

      // Notificar creación a la sala de workspace
      this.io.to(`workspace_${workspaceId}`).emit('NOTE_CREATED', note);

      return note;
    });
  }

  public async updateNote(
    workspaceId: string,
    noteId: string,
    data: { title?: string; content?: string; tags?: string[]; is_pinned?: boolean }
  ): Promise<WorkspaceNote> {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const currentRes = await client.query(
        `SELECT * FROM workspace_notes WHERE id = $1 AND workspace_id = $2`,
        [noteId, workspaceId]
      );

      if (currentRes.rows.length === 0) {
        throw new Error('Note not found in this workspace');
      }

      const current = currentRes.rows[0];
      const newTitle = data.title !== undefined ? data.title : current.title;
      const newContent = data.content !== undefined ? data.content : current.content;
      const newTags = data.tags !== undefined ? data.tags : current.tags;
      const newPinned = data.is_pinned !== undefined ? data.is_pinned : current.is_pinned;

      const res = await client.query(
        `UPDATE workspace_notes
         SET title = $1, content = $2, tags = $3, is_pinned = $4, updated_at = CURRENT_TIMESTAMP
         WHERE id = $5 AND workspace_id = $6
         RETURNING *`,
        [newTitle, newContent, newTags, newPinned, noteId, workspaceId]
      );

      const updated = res.rows[0];

      // Emitir NOTE_UPDATED por WebSocket para colaboración simultánea en el workspace
      this.io.to(`workspace_${workspaceId}`).emit('NOTE_UPDATED', {
        id: updated.id,
        workspaceId,
        title: updated.title,
        content: updated.content,
        tags: updated.tags,
        is_pinned: updated.is_pinned,
        updated_at: updated.updated_at
      });

      return updated;
    });
  }

  public async deleteNote(workspaceId: string, noteId: string): Promise<boolean> {
    return await withWorkspaceClient(this.pool, workspaceId, async (client) => {
      const res = await client.query(
        `DELETE FROM workspace_notes WHERE id = $1 AND workspace_id = $2 RETURNING id`,
        [noteId, workspaceId]
      );

      if (res.rows.length > 0) {
        this.io.to(`workspace_${workspaceId}`).emit('NOTE_DELETED', { noteId, workspaceId });
        return true;
      }
      return false;
    });
  }
}

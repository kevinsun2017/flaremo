// Attachment domain barrel. Preserves the original public surface of the
// former monolithic attachments.ts exactly; internal helpers shared between
// the split modules are intentionally not re-exported.

export {
  bindMemoAttachments,
  finalizeAttachmentCleanup,
  finalizeAttachmentCleanupForIds,
  finalizeAttachmentDelete,
  listAttachmentCleanupCandidates,
  markAttachmentDeleting,
  softDeleteAttachment,
  updateAttachmentMemo,
} from "./attachments-lifecycle";
export {
  type AttachmentListFilter,
  type AttachmentListResult,
  type ListAttachmentsInput,
  type ListAttachmentsPageInput,
  listAllMemoAttachments,
  listAttachments,
  listAttachmentsForMemos,
  listAttachmentsForMemosForViewer,
  listAttachmentsPage,
  listMemoAttachments,
  listMemoAttachmentsForViewer,
  markMemoAttachmentsDeleting,
} from "./attachments-list";
export {
  type CreateAttachmentMetadataInput,
  createAttachmentMetadata,
  getAttachmentByClientId,
  getAttachmentById,
  normalizeAttachmentClientId,
  parseAttachmentDimensions,
  parseAttachmentDuration,
} from "./attachments-metadata";

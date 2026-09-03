import mongoose from 'mongoose';

/**
 * Notification — tenant + user scoped (multi-tenant safe).
 * Every query MUST include BOTH tenantId AND userId.
 */
const notificationSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: [
        'task',
        'schedule',
        'calendar',
        'finance',
        'invitation',
        'goal',
        'habit',
        'journal',
        'focus',
        'reminder',
        'system',
      ],
      default: 'system',
    },
    // Module the notification belongs to (drives icons, deep links, preferences).
    module: {
      type: String,
      enum: [
        'task',
        'schedule',
        'calendar',
        'journal',
        'focus',
        'finance',
        'habit',
        'goal',
        'system',
        'invitation',
      ],
      default: 'system',
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    body: {
      type: String,
      maxlength: 1000,
    },
    // Optional related record (task/event/goal id) for deep links.
    relatedId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    priority: {
      type: String,
      enum: ['low', 'normal', 'high'],
      default: 'normal',
    },
    data: {
      type: Object,
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
    },
    /**
     * Idempotency key for scheduler/reminder notifications so a page refresh or
     * a repeated scheduler tick can NEVER duplicate the same reminder.
     * Example: `task-due:507f1f77bcf86cd799439011`.
     * Unique + sparse: only documents that set dedupeKey are constrained.
     */
    dedupeKey: {
      type: String,
      maxlength: 200,
    },
  },
  { timestamps: true }
);

notificationSchema.index({ tenantId: 1, userId: 1, isRead: 1 });
notificationSchema.index({ tenantId: 1, createdAt: -1 });
notificationSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;

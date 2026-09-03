import mongoose from 'mongoose';

const calendarEventSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    type: {
      type: String,
      enum: ['work', 'school', 'meeting', 'study', 'exercise', 'personal', 'appointment', 'task', 'other'],
      default: 'personal',
    },
    description: { type: String },
    allDay: { type: Boolean, default: false },
    startAt: { type: Date, required: true },
    endAt: { type: Date },
  },
  { timestamps: true }
);

calendarEventSchema.index({ tenantId: 1, startAt: 1 });

export default mongoose.model('CalendarEvent', calendarEventSchema);

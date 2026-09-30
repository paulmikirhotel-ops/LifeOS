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
    // Set when the event was created by the Meetings module.
    meetingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting' },
  },
  { timestamps: true }
);

calendarEventSchema.index({ tenantId: 1, startAt: 1 });
calendarEventSchema.index({ meetingId: 1 }, { sparse: true });

export default mongoose.model('CalendarEvent', calendarEventSchema);

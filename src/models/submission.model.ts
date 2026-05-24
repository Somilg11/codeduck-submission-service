import mongoose, { Document } from "mongoose";

export enum SubmissionStatus {
    PENDING = 'pending',
    COMPILING = 'compiling',
    ACCEPTED = 'accepted',
    REJECTED = 'rejected',
    WRONG_ANSWER = 'wrong_answer',
}

export enum SubmissionLanguage {
    PYTHON = 'python',
    // JAVA = 'java',
    CPP = 'cpp',
    // JAVASCRIPT = 'javascript',
}

export interface ISubmission extends Document {
    problemId: string;
    code: string;
    language: SubmissionLanguage;
    status: SubmissionStatus;
    createdAt: Date;
    updatedAt: Date;
}

const submissionSchema = new mongoose.Schema<ISubmission>({
    problemId: { type: String, required: [true, 'Problem ID is required'] },
    code: { type: String, required: [true, 'Code is required'] },
    language: { type: String, enum: Object.values(SubmissionLanguage), required: [true, 'Language is required'] },
    status: { type: String, enum: Object.values(SubmissionStatus), default: SubmissionStatus.PENDING },
}, {
    timestamps: true,
    toJSON: {
        transform: (_, record) => {
            delete (record as any).__v;
            (record as any).id = (record as any)._id;
            delete (record as any)._id;
            return record;
        }
    }
});

submissionSchema.index({ status: 1 });

export const Submission = mongoose.model<ISubmission>('Submission', submissionSchema);
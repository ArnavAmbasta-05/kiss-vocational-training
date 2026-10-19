import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AssessmentCreateInput,
  AssessmentDto,
  AssessmentUpdateInput,
  AttendanceSaveInput,
  AttendanceSheet,
  BatchAttendanceRow,
  EvaluationDto,
  EvaluationRow,
  EvaluationSaveInput,
  ProgressCreateInput,
  ProgressDto,
  ResultsSaveInput,
  ResultsSheet,
  SessionDto,
  StudentTraining,
} from '@vtmp/shared';
import { api } from '../../lib/api/client';

export type MySession = SessionDto & {
  batchName: string;
  courseTitle: string;
  marked: number;
  rosterSize: number;
};

/** Figures must be live (BO-4): these queries are never served stale. */
const live = { staleTime: 0 } as const;

export const useMySessions = () =>
  useQuery({
    queryKey: ['sessions', 'mine'],
    queryFn: ({ signal }) => api.get<MySession[]>('/sessions/mine', { signal }),
    ...live,
  });

export const useAttendanceSheet = (sessionId: string) =>
  useQuery({
    queryKey: ['attendance', sessionId],
    queryFn: ({ signal }) =>
      api.get<AttendanceSheet>(`/sessions/${sessionId}/attendance`, { signal }),
    ...live,
  });

export const useAttendanceSummary = (batchId: string) =>
  useQuery({
    queryKey: ['attendance-summary', batchId],
    queryFn: ({ signal }) =>
      api.get<BatchAttendanceRow[]>(`/batches/${batchId}/attendance-summary`, { signal }),
    ...live,
  });

export const useAssessments = (batchId: string | undefined) =>
  useQuery({
    queryKey: ['assessments', batchId],
    enabled: !!batchId,
    queryFn: ({ signal }) =>
      api.get<AssessmentDto[]>(`/batches/${batchId}/assessments`, { signal }),
    ...live,
  });

export const useResults = (assessmentId: string) =>
  useQuery({
    queryKey: ['results', assessmentId],
    queryFn: ({ signal }) =>
      api.get<ResultsSheet>(`/assessments/${assessmentId}/results`, { signal }),
    ...live,
  });

export const useProgress = (batchId: string) =>
  useQuery({
    queryKey: ['progress', batchId],
    queryFn: ({ signal }) => api.get<ProgressDto[]>(`/batches/${batchId}/progress`, { signal }),
  });

export const useEvaluations = (batchId: string) =>
  useQuery({
    queryKey: ['evaluations', batchId],
    queryFn: ({ signal }) =>
      api.get<EvaluationRow[]>(`/batches/${batchId}/evaluations`, { signal }),
  });

export const useMyTraining = () =>
  useQuery({
    queryKey: ['my-training'],
    queryFn: ({ signal }) => api.get<StudentTraining[]>('/students/me/training', { signal }),
    ...live,
  });

/** Training data feeds many views; refresh them all after any change. */
function useRefresh() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [
        'attendance',
        'attendance-summary',
        'sessions',
        'batches',
        'assessments',
        'results',
        'progress',
        'evaluations',
        'my-training',
      ].map((k) => qc.invalidateQueries({ queryKey: [k] })),
    );
}

function useTrainingMutation<A, R>(fn: (a: A) => Promise<R>) {
  const refresh = useRefresh();
  return useMutation({ mutationFn: fn, onSuccess: refresh });
}

export const useSaveAttendance = () =>
  useTrainingMutation(({ sessionId, input }: { sessionId: string; input: AttendanceSaveInput }) =>
    api.put<AttendanceSheet>(`/sessions/${sessionId}/attendance`, input),
  );

export const useCreateAssessment = () =>
  useTrainingMutation(({ batchId, input }: { batchId: string; input: AssessmentCreateInput }) =>
    api.post<AssessmentDto>(`/batches/${batchId}/assessments`, input),
  );

export const useUpdateAssessment = () =>
  useTrainingMutation(({ id, input }: { id: string; input: AssessmentUpdateInput }) =>
    api.patch<AssessmentDto>(`/assessments/${id}`, input),
  );

export const useDeleteAssessment = () =>
  useTrainingMutation((id: string) => api.delete<void>(`/assessments/${id}`));

export const useSaveResults = () =>
  useTrainingMutation(({ id, input }: { id: string; input: ResultsSaveInput }) =>
    api.put<ResultsSheet>(`/assessments/${id}/results`, input),
  );

export const useAddProgress = () =>
  useTrainingMutation(({ batchId, input }: { batchId: string; input: ProgressCreateInput }) =>
    api.post<ProgressDto>(`/batches/${batchId}/progress`, input),
  );

export const useSaveEvaluation = () =>
  useTrainingMutation(
    ({ enrollmentId, input }: { enrollmentId: string; input: EvaluationSaveInput }) =>
      api.put<EvaluationDto>(`/enrollments/${enrollmentId}/evaluation`, input),
  );

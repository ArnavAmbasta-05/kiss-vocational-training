import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssistantMode, AssistantReply, PracticeQuestion } from '@vtmp/shared';
import { ASSISTANT_MODES } from '@vtmp/shared';
import { Badge, Button, Card, cn, EmptyState, PageSkeleton } from '../../components/ui';
import { useErrorMessage } from '../../lib/api/useErrorMessage';
import { useAsk, useAssistantStatus } from './api';

interface Turn {
  id: number;
  question: string;
  reply: AssistantReply;
}

const MAX_QUESTION = 1000;

/**
 * Student: the AI Training Assistant (F17). Answers, simpler explanations and practice questions
 * come only from approved materials of the student's own course, with the excerpts they used
 * (BR-21, BRQ-17.1–17.4). The conversation stays in this tab; nothing is kept on the device.
 */
export function AssistantPage() {
  const { t } = useTranslation('assistant');
  const errorMessage = useErrorMessage();
  const status = useAssistantStatus();
  const ask = useAsk();
  const [mode, setMode] = useState<AssistantMode>('answer');
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (q.length < 3) {
      setError(t('tooShort'));
      return;
    }
    setError(null);
    try {
      const reply = await ask.mutateAsync({ question: q, mode });
      setTurns((list) => [{ id: Date.now(), question: q, reply }, ...list]);
      setQuestion('');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const header = (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-700">{t('intro')}</p>
    </div>
  );

  if (status.isPending) return <PageSkeleton />;
  if (status.isError) return <EmptyState title={errorMessage(status.error)} />;
  const s = status.data;
  if (!s.enabled) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <EmptyState title={t('off')} />
      </div>
    );
  }
  if (s.courses.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <EmptyState title={t('noMaterials')} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {header}
      <Card>
        <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)} noValidate>
          <p className="text-sm text-slate-700">
            {t('courses', { list: s.courses.map((c) => c.title).join(', ') })}
          </p>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-900">{t('modeLabel')}</legend>
            <div className="flex flex-wrap gap-2">
              {ASSISTANT_MODES.map((m) => (
                <label
                  key={m}
                  className={cn(
                    'cursor-pointer rounded-md border px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-brand-600',
                    mode === m
                      ? 'border-brand-700 bg-brand-50 font-semibold text-brand-800'
                      : 'border-slate-400 bg-white text-slate-800',
                  )}
                >
                  <input
                    type="radio"
                    name="mode"
                    value={m}
                    checked={mode === m}
                    onChange={() => setMode(m)}
                    className="sr-only"
                  />
                  {t(`mode.${m}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-col gap-1">
            <label htmlFor={inputId} className="text-sm font-medium text-slate-900">
              {t('questionLabel')}
            </label>
            <textarea
              id={inputId}
              rows={3}
              maxLength={MAX_QUESTION}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={t(`placeholder.${mode}`)}
              aria-invalid={error ? true : undefined}
              aria-describedby={`${inputId}-hint${error ? ` ${inputId}-error` : ''}`}
              className="w-full rounded-md border border-slate-400 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            />
            <p id={`${inputId}-hint`} className="text-xs text-slate-600">
              {t('remaining', { count: s.remainingToday, limit: s.dailyLimit })}
            </p>
            {error && (
              <p id={`${inputId}-error`} role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
          </div>
          <div>
            <Button type="submit" loading={ask.isPending} disabled={s.remainingToday === 0}>
              {t('ask')}
            </Button>
          </div>
          <p className="text-xs text-slate-600">{t('disclaimer')}</p>
        </form>
      </Card>

      <section aria-live="polite" aria-label={t('answers')} className="flex flex-col gap-4">
        {turns.map((turn) => (
          <TurnCard key={turn.id} turn={turn} />
        ))}
      </section>
    </div>
  );
}

/** Turns "… [1] … [2]" into text with numbered source markers (no HTML from the model). */
function WithCitations({ text, prefix }: { text: string; prefix: string }) {
  const { t } = useTranslation('assistant');
  const parts = text.split(/(\[\d+\])/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = /^\[(\d+)\]$/.exec(p);
        return m ? (
          <sup key={i} className="ml-0.5 font-semibold text-brand-700">
            <a href={`#${prefix}-${m[1]}`} aria-label={t('sourceN', { n: m[1] })}>
              [{m[1]}]
            </a>
          </sup>
        ) : (
          <span key={i}>{p}</span>
        );
      })}
    </>
  );
}

function TurnCard({ turn }: { turn: Turn }) {
  const { t } = useTranslation('assistant');
  const r = turn.reply;
  let body: ReactNode;
  if (r.refused) {
    body = <p className="text-sm text-slate-800">{t(`refused.${r.refused}`)}</p>;
  } else if (r.questions) {
    body = (
      <ol className="flex flex-col gap-4">
        {r.questions.map((q, i) => (
          <Practice key={i} q={q} index={i} turnId={turn.id} />
        ))}
      </ol>
    );
  } else {
    body = (
      <p className="whitespace-pre-line text-sm leading-relaxed text-slate-900">
        <WithCitations text={r.answer ?? ''} prefix={`src-${turn.id}`} />
      </p>
    );
  }

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-2 flex flex-wrap items-center gap-2">
        <Badge tone="info">{t(`mode.${r.mode}`)}</Badge>
        <h2 className="text-base font-semibold text-slate-900">{turn.question}</h2>
      </header>
      {body}
      {r.sources.length > 0 && !r.refused && (
        <div className="mt-3">
          <h3 className="text-sm font-semibold text-slate-900">{t('sources')}</h3>
          <ul className="mt-1 flex flex-col gap-1" data-testid="sources">
            {r.sources.map((s) => (
              <li key={s.chunkId} id={`src-${turn.id}-${s.n}`}>
                <details className="rounded-md bg-slate-50 px-3 py-2 text-sm">
                  <summary className="cursor-pointer text-slate-800">
                    [{s.n}] {s.materialTitle}
                  </summary>
                  <p className="mt-1 text-xs text-slate-700">{s.excerpt}</p>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}
      {r.resources.length > 0 && (
        <div className="mt-3">
          <h3 className="text-sm font-semibold text-slate-900">{t('resources')}</h3>
          <ul className="mt-1 flex flex-wrap gap-2">
            {r.resources.map((x) => (
              <li key={x.id}>
                <a
                  href={x.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-brand-700 underline"
                >
                  {x.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

/** One multiple-choice question: pick, check, see the explanation and its source. */
function Practice({ q, index, turnId }: { q: PracticeQuestion; index: number; turnId: number }) {
  const { t } = useTranslation('assistant');
  const [picked, setPicked] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const name = `q-${turnId}-${index}`;
  const correct = picked === q.answerIndex;
  return (
    <li>
      <fieldset>
        <legend className="text-sm font-medium text-slate-900">
          {index + 1}. {q.question}
        </legend>
        <div className="mt-2 flex flex-col gap-1">
          {q.options.map((o, i) => (
            <label key={i} className="flex items-center gap-2 text-sm text-slate-800">
              <input
                type="radio"
                name={name}
                checked={picked === i}
                onChange={() => {
                  setPicked(i);
                  setChecked(false);
                }}
              />
              {o}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="secondary"
          disabled={picked === null}
          onClick={() => setChecked(true)}
        >
          {t('check')}
        </Button>
        {checked && (
          <p role="status" className={cn('text-sm', correct ? 'text-green-800' : 'text-red-700')}>
            {correct ? t('correct') : t('wrong', { answer: q.options[q.answerIndex] })}{' '}
            <span className="text-slate-700">
              {q.explanation} <WithCitations text={`[${q.source}]`} prefix={`src-${turnId}`} />
            </span>
          </p>
        )}
      </div>
    </li>
  );
}

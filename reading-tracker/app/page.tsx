"use client";

import { useEffect, useMemo, useState } from "react";

type BookStatus = "not-started" | "in-progress" | "completed";

type Book = {
  id: string;
  title: string;
  author: string;
  totalPages: number;
  currentPage: number;
  status: BookStatus;
  startedAt: string;
  targetDate?: string;
  notes?: string;
};

type ReadingSession = {
  id: string;
  bookId: string;
  date: string;
  pagesRead: number;
  minutes: number;
  note?: string;
};

type TrackerState = {
  books: Book[];
  sessions: ReadingSession[];
  preferences: {
    weeklyMinutesGoal: number;
    dailyPagesGoal: number;
    showCompleted: boolean;
  };
};

type BookFormState = {
  title: string;
  author: string;
  totalPages: string;
  targetDate: string;
  notes: string;
};

type SessionFormState = {
  bookId: string;
  date: string;
  pagesRead: string;
  minutes: string;
  note: string;
};

const STORAGE_KEY = "reading-tracker-state-v1";

const DEFAULT_STATE: TrackerState = {
  books: [],
  sessions: [],
  preferences: {
    weeklyMinutesGoal: 420,
    dailyPagesGoal: 30,
    showCompleted: true,
  },
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const safeId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10);

const formatDisplayDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const sum = (values: number[]) =>
  values.reduce((acc, current) => acc + current, 0);

export default function Home() {
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<TrackerState>(DEFAULT_STATE);
  const [bookForm, setBookForm] = useState<BookFormState>({
    title: "",
    author: "",
    totalPages: "",
    targetDate: "",
    notes: "",
  });
  const [sessionForm, setSessionForm] = useState<SessionFormState>({
    bookId: "",
    date: todayIso(),
    pagesRead: "",
    minutes: "",
    note: "",
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as TrackerState;
        setState({
          ...DEFAULT_STATE,
          ...parsed,
          preferences: {
            ...DEFAULT_STATE.preferences,
            ...parsed.preferences,
          },
        });
      }
    } catch {
      // ignore broken local state
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  useEffect(() => {
    if (!state.books.length) {
      return;
    }
    setSessionForm((current) => {
      if (current.bookId && state.books.some((b) => b.id === current.bookId)) {
        return current;
      }
      return {
        ...current,
        bookId: state.books[0]?.id ?? "",
      };
    });
  }, [state.books]);

  const booksById = useMemo(() => {
    const map = new Map<string, Book>();
    state.books.forEach((book) => map.set(book.id, book));
    return map;
  }, [state.books]);

  const stats = useMemo(() => {
    const completedBooks = state.books.filter(
      (book) => book.status === "completed",
    );
    const activeBooks = state.books.filter(
      (book) => book.status !== "completed",
    );
    const totalPagesRead = sum(state.sessions.map((session) => session.pagesRead));
    const totalMinutes = sum(state.sessions.map((session) => session.minutes));
    const minutesPerPage =
      totalPagesRead === 0 ? 0 : Math.round((totalMinutes / totalPagesRead) * 10) / 10;
    const totalDays = (() => {
      if (state.sessions.length === 0) {
        return 0;
      }
      const timestamps = state.sessions
        .map((session) => {
          const value = new Date(session.date);
          return Number.isNaN(value.getTime()) ? null : value;
        })
        .filter((value): value is Date => value !== null)
        .sort((a, b) => a.getTime() - b.getTime());
      if (!timestamps.length) {
        return 0;
      }
      const first = timestamps[0];
      const last = timestamps[timestamps.length - 1];
      const diffMs = last.getTime() - first.getTime();
      return Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);
    })();
    const uniqueDays = new Set(
      state.sessions.map((session) => session.date),
    ).size;
    const averageDailyPages =
      totalPagesRead === 0 || totalDays === 0
        ? 0
        : Math.round((totalPagesRead / totalDays) * 10) / 10;
    const weekStart = (() => {
      const base = new Date();
      base.setDate(base.getDate() - 6);
      base.setHours(0, 0, 0, 0);
      return base;
    })();
    const sessionsThisWeek = state.sessions.filter(
      (session) => new Date(session.date) >= weekStart,
    );
    const minutesThisWeek = sum(sessionsThisWeek.map((session) => session.minutes));
    const pagesThisWeek = sum(sessionsThisWeek.map((session) => session.pagesRead));
    const streak = (() => {
      if (!state.sessions.length) {
        return 0;
      }
      const days = new Set(
        state.sessions.map((session) => session.date),
      );
      const current = new Date();
      let counter = 0;
      for (;;) {
        const key = current.toISOString().slice(0, 10);
        if (days.has(key)) {
          counter += 1;
          current.setDate(current.getDate() - 1);
        } else if (
          counter === 0 &&
          days.has(new Date(current.getTime() - 86400000).toISOString().slice(0, 10))
        ) {
          current.setDate(current.getDate() - 1);
        } else {
          break;
        }
      }
      return counter;
    })();
    return {
      completedBooks,
      activeBooks,
      totalPagesRead,
      totalMinutes,
      minutesPerPage,
      averageDailyPages,
      uniqueDays,
      minutesThisWeek,
      pagesThisWeek,
      streak,
    };
  }, [state.books, state.sessions]);

  const handleBookSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const totalPages = Number.parseInt(bookForm.totalPages, 10);
    if (!bookForm.title.trim() || !bookForm.author.trim()) {
      setError("Title and author are both required.");
      return;
    }
    if (Number.isNaN(totalPages) || totalPages <= 0) {
      setError("Total pages must be a positive number.");
      return;
    }
    const newBook: Book = {
      id: safeId(),
      title: bookForm.title.trim(),
      author: bookForm.author.trim(),
      totalPages,
      currentPage: 0,
      status: "not-started",
      startedAt: todayIso(),
      targetDate: bookForm.targetDate || undefined,
      notes: bookForm.notes.trim() || undefined,
    };
    setState((prev) => ({
      ...prev,
      books: [newBook, ...prev.books],
    }));
    setBookForm({
      title: "",
      author: "",
      totalPages: "",
      targetDate: "",
      notes: "",
    });
    setSessionForm((current) => ({
      ...current,
      bookId: newBook.id,
    }));
  };

  const handleSessionSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!sessionForm.bookId) {
      setError("Please pick a book before logging a session.");
      return;
    }
    const book = booksById.get(sessionForm.bookId);
    if (!book) {
      setError("Selected book no longer exists.");
      return;
    }
    const pages = Number.parseInt(sessionForm.pagesRead, 10);
    const minutes = Number.parseInt(sessionForm.minutes, 10);
    if (Number.isNaN(pages) || pages <= 0) {
      setError("Pages read must be a positive number.");
      return;
    }
    if (Number.isNaN(minutes) || minutes <= 0) {
      setError("Minutes must be a positive number.");
      return;
    }
    const clampedPages = clamp(
      pages,
      1,
      Math.max(book.totalPages - book.currentPage, pages),
    );
    const newSession: ReadingSession = {
      id: safeId(),
      bookId: book.id,
      date: sessionForm.date,
      pagesRead: clampedPages,
      minutes,
      note: sessionForm.note.trim() || undefined,
    };
    setState((prev) => ({
      ...prev,
      sessions: [newSession, ...prev.sessions].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      ),
      books: prev.books.map((item) =>
        item.id === book.id
          ? {
              ...item,
              currentPage: clamp(
                item.currentPage + clampedPages,
                0,
                item.totalPages,
              ),
              status:
                item.currentPage + clampedPages >= item.totalPages
                  ? "completed"
                  : "in-progress",
            }
          : item,
      ),
    }));
    setSessionForm((current) => ({
      ...current,
      pagesRead: "",
      minutes: "",
      note: "",
    }));
  };

  const updateBookProgress = (bookId: string, value: number) => {
    setState((prev) => ({
      ...prev,
      books: prev.books.map((book) =>
        book.id === bookId
          ? {
              ...book,
              currentPage: clamp(value, 0, book.totalPages),
              status:
                value >= book.totalPages
                  ? "completed"
                  : value === 0
                    ? "not-started"
                    : "in-progress",
            }
          : book,
      ),
    }));
  };

  const toggleCompletedVisibility = () => {
    setState((prev) => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        showCompleted: !prev.preferences.showCompleted,
      },
    }));
  };

  const updateGoal = (field: "weeklyMinutesGoal" | "dailyPagesGoal", value: number) => {
    if (Number.isNaN(value) || value <= 0) {
      return;
    }
    setState((prev) => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        [field]: value,
      },
    }));
  };

  const removeSession = (sessionId: string) => {
    const session = state.sessions.find((item) => item.id === sessionId);
    if (!session) {
      return;
    }
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.filter((item) => item.id !== sessionId),
      books: prev.books.map((item) =>
        item.id === session.bookId
          ? {
              ...item,
              currentPage: clamp(
                item.currentPage - session.pagesRead,
                0,
                item.totalPages,
              ),
              status:
                item.currentPage - session.pagesRead <= 0
                  ? "not-started"
                  : "in-progress",
            }
          : item,
      ),
    }));
  };

  const filteredBooks = useMemo(() => {
    if (state.preferences.showCompleted) {
      return state.books;
    }
    return state.books.filter((book) => book.status !== "completed");
  }, [state.books, state.preferences.showCompleted]);

  const goalProgressMinutes = (() => {
    const goal = state.preferences.weeklyMinutesGoal;
    if (!goal) {
      return 0;
    }
    return Math.min(100, Math.round((stats.minutesThisWeek / goal) * 100));
  })();

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <div className="animate-pulse text-center">
          <p className="text-lg font-semibold tracking-wide">Loading your library</p>
          <p className="mt-2 text-sm text-slate-400">
            Your reading history is syncing…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#0f172a,transparent),linear-gradient(180deg,#020617,#111827)] pb-24 text-slate-100">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pt-20 sm:px-10">
        <header className="flex flex-col gap-6 rounded-3xl border border-slate-800 bg-slate-900/60 p-8 shadow-xl backdrop-blur">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.3rem] text-indigo-300">
                Personal Reading Hub
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">
                Track your reading habit, stay motivated
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-300">
              <div className="rounded-full border border-slate-700 px-4 py-2">
                Weekly goal: {state.preferences.weeklyMinutesGoal} min
              </div>
              <div className="rounded-full border border-slate-700 px-4 py-2">
                Daily goal: {state.preferences.dailyPagesGoal} pages
              </div>
              <button
                type="button"
                onClick={toggleCompletedVisibility}
                className="rounded-full border border-indigo-400/50 px-4 py-2 text-indigo-200 transition hover:border-indigo-300 hover:text-white"
              >
                {state.preferences.showCompleted ? "Hide" : "Show"} completed
              </button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
              <p className="text-sm text-slate-400">Books completed</p>
              <p className="mt-3 text-3xl font-semibold text-white">
                {stats.completedBooks.length}
              </p>
              <p className="mt-1 text-xs uppercase tracking-wide text-emerald-300/80">
                +{stats.completedBooks.length} total victories
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
              <p className="text-sm text-slate-400">Pages read</p>
              <p className="mt-3 text-3xl font-semibold text-white">
                {stats.totalPagesRead.toLocaleString()}
              </p>
              <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">
                {stats.averageDailyPages} pages / day on average
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
              <p className="text-sm text-slate-400">Current streak</p>
              <p className="mt-3 text-3xl font-semibold text-white">
                {stats.streak} day{stats.streak === 1 ? "" : "s"}
              </p>
              <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">
                You&apos;ve logged activity on {stats.uniqueDays} days
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-indigo-500/20 bg-indigo-900/30 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-wide text-indigo-200">
                  Weekly progress
                </p>
                <p className="mt-2 text-lg font-semibold text-indigo-100">
                  {stats.minutesThisWeek} / {state.preferences.weeklyMinutesGoal} minutes
                </p>
                <p className="text-xs text-indigo-200/80">
                  {stats.pagesThisWeek} pages logged since{" "}
                  {new Date(new Date().setDate(new Date().getDate() - 6)).toLocaleDateString()}
                </p>
              </div>
              <div className="relative h-24 w-24 shrink-0">
                <svg viewBox="0 0 36 36" className="h-full w-full rotate-[-90deg]">
                  <path
                    d="M18 2a16 16 0 1 1 0 32 16 16 0 0 1 0-32"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                    className="text-indigo-950/40"
                    strokeLinecap="round"
                  />
                  <path
                    d="M18 2a16 16 0 1 1 0 32 16 16 0 0 1 0-32"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                    className="text-indigo-300"
                    strokeLinecap="round"
                    strokeDasharray={`${goalProgressMinutes}, 100`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-indigo-100">
                  <span className="text-xl font-semibold">{goalProgressMinutes}%</span>
                  <span className="text-xs uppercase tracking-wide">Weekly</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-white">Add a new book</h2>
            <p className="mt-1 text-sm text-slate-400">
              Capture books you&apos;re excited to dive into and set a gentle target date.
            </p>
            <form className="mt-6 grid gap-4" onSubmit={handleBookSubmit}>
              <div className="grid gap-2">
                <label className="text-sm text-slate-300" htmlFor="book-title">
                  Title
                </label>
                <input
                  id="book-title"
                  value={bookForm.title}
                  onChange={(event) =>
                    setBookForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  className="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/40"
                  placeholder="Atomic Habits"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm text-slate-300" htmlFor="book-author">
                  Author
                </label>
                <input
                  id="book-author"
                  value={bookForm.author}
                  onChange={(event) =>
                    setBookForm((current) => ({
                      ...current,
                      author: event.target.value,
                    }))
                  }
                  className="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/40"
                  placeholder="James Clear"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <label className="text-sm text-slate-300" htmlFor="book-pages">
                    Total pages
                  </label>
                  <input
                    id="book-pages"
                    inputMode="numeric"
                    value={bookForm.totalPages}
                    onChange={(event) =>
                      setBookForm((current) => ({
                        ...current,
                        totalPages: event.target.value,
                      }))
                    }
                    className="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/40"
                    placeholder="320"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm text-slate-300" htmlFor="book-target">
                    Target finish date
                  </label>
                  <input
                    id="book-target"
                    type="date"
                    value={bookForm.targetDate}
                    onChange={(event) =>
                      setBookForm((current) => ({
                        ...current,
                        targetDate: event.target.value,
                      }))
                    }
                    className="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/40"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <label className="text-sm text-slate-300" htmlFor="book-notes">
                  Notes
                </label>
                <textarea
                  id="book-notes"
                  value={bookForm.notes}
                  onChange={(event) =>
                    setBookForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  className="h-24 rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/40"
                  placeholder="Why this book matters, key themes you want to explore…"
                />
              </div>
              <button
                type="submit"
                className="mt-2 inline-flex items-center justify-center rounded-xl bg-indigo-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400"
              >
                Add book
              </button>
            </form>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-white">Log a reading session</h2>
            <p className="mt-1 text-sm text-slate-400">
              Celebrate every focused block. The tracker keeps an eye on your progress and streak.
            </p>
            <form className="mt-6 grid gap-4" onSubmit={handleSessionSubmit}>
              <div className="grid gap-2">
                <label className="text-sm text-slate-300" htmlFor="session-book">
                  Book
                </label>
                <select
                  id="session-book"
                  value={sessionForm.bookId}
                  onChange={(event) =>
                    setSessionForm((current) => ({
                      ...current,
                      bookId: event.target.value,
                    }))
                  }
                  className="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/40"
                >
                  <option value="" disabled>
                    Select a book
                  </option>
                  {state.books.map((book) => (
                    <option key={book.id} value={book.id}>
                      {book.title} — {book.status === "completed" ? "Completed" : `${book.currentPage}/${book.totalPages} pages`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <label className="text-sm text-slate-300" htmlFor="session-date">
                    Date
                  </label>
                  <input
                    id="session-date"
                    type="date"
                    value={sessionForm.date}
                    onChange={(event) =>
                      setSessionForm((current) => ({
                        ...current,
                        date: event.target.value,
                      }))
                    }
                    className="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/40"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm text-slate-300" htmlFor="session-minutes">
                    Minutes
                  </label>
                  <input
                    id="session-minutes"
                    inputMode="numeric"
                    value={sessionForm.minutes}
                    onChange={(event) =>
                      setSessionForm((current) => ({
                        ...current,
                        minutes: event.target.value,
                      }))
                    }
                    className="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/40"
                    placeholder="45"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <label className="text-sm text-slate-300" htmlFor="session-pages">
                  Pages read
                </label>
                <input
                  id="session-pages"
                  inputMode="numeric"
                  value={sessionForm.pagesRead}
                  onChange={(event) =>
                    setSessionForm((current) => ({
                      ...current,
                      pagesRead: event.target.value,
                    }))
                  }
                  className="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/40"
                  placeholder="24"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm text-slate-300" htmlFor="session-note">
                  Reflection
                </label>
                <textarea
                  id="session-note"
                  value={sessionForm.note}
                  onChange={(event) =>
                    setSessionForm((current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                  className="h-24 rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/40"
                  placeholder="Key ideas, quotes, lingering questions…"
                />
              </div>
              <button
                type="submit"
                className="mt-2 inline-flex items-center justify-center rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400"
              >
                Log session
              </button>
            </form>
            <div className="mt-6 grid gap-3 rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-300">
              <div className="flex items-center justify-between">
                <span>Reading pace</span>
                <span>{stats.minutesPerPage || "—"} min / page</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Daily rhythm</span>
                <span>{stats.averageDailyPages || "—"} pages / day</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Active books</span>
                <span>{stats.activeBooks.length}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Library overview</h2>
                <p className="text-sm text-slate-400">
                  Track how each book is progressing and update pages on the fly.
                </p>
              </div>
              <div className="rounded-full border border-slate-700 px-4 py-2 text-xs uppercase tracking-wide text-slate-400">
                {filteredBooks.length} book{filteredBooks.length === 1 ? "" : "s"}
              </div>
            </div>
            <div className="mt-6 space-y-4">
              {filteredBooks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-10 text-center text-sm text-slate-400">
                  Add your first book to start tracking pages, progress, and streaks.
                </div>
              ) : (
                filteredBooks.map((book) => {
                  const progress =
                    book.totalPages === 0
                      ? 0
                      : Math.round((book.currentPage / book.totalPages) * 100);
                  return (
                    <article
                      key={book.id}
                      className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 transition hover:border-indigo-400/40"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="text-xl font-semibold text-white">
                            {book.title}
                          </h3>
                          <p className="text-sm text-slate-400">by {book.author}</p>
                          {book.targetDate ? (
                            <p className="mt-1 text-xs text-slate-500">
                              Target: {formatDisplayDate(book.targetDate)}
                            </p>
                          ) : null}
                        </div>
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide ${
                            book.status === "completed"
                              ? "bg-emerald-500/20 text-emerald-200"
                              : book.status === "in-progress"
                                ? "bg-indigo-500/20 text-indigo-200"
                                : "bg-slate-700/40 text-slate-300"
                          }`}
                        >
                          {book.status.replace("-", " ")}
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-slate-300">
                        <div>
                          {book.currentPage.toLocaleString()} /{" "}
                          {book.totalPages.toLocaleString()} pages
                        </div>
                        <div>Progress: {progress}%</div>
                        <div>Started {formatDisplayDate(book.startedAt)}</div>
                      </div>
                      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-indigo-400 transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                        <input
                          type="range"
                          min={0}
                          max={book.totalPages}
                          value={book.currentPage}
                          onChange={(event) =>
                            updateBookProgress(book.id, Number(event.target.value))
                          }
                          className="accent-indigo-400"
                        />
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span>Adjust progress</span>
                          <span className="rounded-full border border-slate-700 px-2 py-1 text-slate-200">
                            {book.currentPage} pages
                          </span>
                        </div>
                      </div>
                      {book.notes ? (
                        <p className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-300">
                          {book.notes}
                        </p>
                      ) : null}
                    </article>
                  );
                })
              )}
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg">
              <h2 className="text-lg font-semibold text-white">Goals & targets</h2>
              <p className="mt-1 text-sm text-slate-400">
                Adjust your focus for the week. The tracker updates everything instantly.
              </p>
              <div className="mt-5 grid gap-4">
                <label className="grid gap-2 text-sm text-slate-300">
                  Weekly minutes goal
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={60}
                      max={840}
                      step={15}
                      value={state.preferences.weeklyMinutesGoal}
                      onChange={(event) =>
                        updateGoal("weeklyMinutesGoal", Number(event.target.value))
                      }
                      className="flex-1 accent-indigo-400"
                    />
                    <span className="w-16 text-right text-xs text-indigo-200">
                      {state.preferences.weeklyMinutesGoal}
                    </span>
                  </div>
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  Daily pages goal
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={10}
                      max={150}
                      step={5}
                      value={state.preferences.dailyPagesGoal}
                      onChange={(event) =>
                        updateGoal("dailyPagesGoal", Number(event.target.value))
                      }
                      className="flex-1 accent-indigo-400"
                    />
                    <span className="w-16 text-right text-xs text-indigo-200">
                      {state.preferences.dailyPagesGoal}
                    </span>
                  </div>
                </label>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-300">
                  At your current pace of{" "}
                  <span className="font-semibold text-indigo-200">
                    {stats.averageDailyPages || "—"} pages/day
                  </span>
                  , you&apos;ll meet your daily target in{" "}
                  {state.preferences.dailyPagesGoal && stats.averageDailyPages
                    ? `${Math.ceil(
                        state.preferences.dailyPagesGoal / stats.averageDailyPages,
                      )} sessions`
                    : "a few focused sessions"}.
                </div>
              </div>
            </div>
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg">
              <h2 className="text-lg font-semibold text-white">Session history</h2>
              <p className="mt-1 text-sm text-slate-400">
                Review recent notes and remove entries that no longer apply.
              </p>
              <div className="mt-5 space-y-4">
                {state.sessions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-10 text-center text-sm text-slate-400">
                    No sessions yet — log your first reading block to build momentum.
                  </div>
                ) : (
                  state.sessions.slice(0, 6).map((session) => {
                    const book = booksById.get(session.bookId);
                    return (
                      <article
                        key={session.id}
                        className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-200"
                      >
                        <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-wide text-slate-400">
                          <span>{formatDisplayDate(session.date)}</span>
                          <button
                            type="button"
                            onClick={() => removeSession(session.id)}
                            className="rounded-full border border-red-500/40 px-2 py-1 text-[10px] text-red-200 transition hover:bg-red-500/20 hover:text-white"
                          >
                            Remove
                          </button>
                        </div>
                        <div className="mt-2 text-sm font-semibold text-white">
                          {book ? book.title : "Unknown book"}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {session.pagesRead} pages · {session.minutes} minutes
                        </div>
                        {session.note ? (
                          <p className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300">
                            {session.note}
                          </p>
                        ) : null}
                      </article>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

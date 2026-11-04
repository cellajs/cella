import { useEffect, useRef, useState } from 'react';
import { useDebounce } from '~/hooks/use-debounce';
import { typingPause } from '~/modules/common/search-field';

const wordSeparators = /[\s,]+/;
const splitWords = (text: string) => text.split(wordSeparators).filter(Boolean);
const joinQuery = (words: string[], draft: string) => [...words, draft.trim()].filter(Boolean).join(' ');

const isComposing = (event: Event) => event instanceof InputEvent && event.isComposing;

/** A finished word being edited in place, and its text so far. */
export interface WordEdit {
  word: string;
  text: string;
}

interface SearchWordsOptions {
  value: string;
  onSearch: (value: string, typingWord: string) => void;
  wordEdit?: WordEdit | null;
}

/** The words of a chips field: finished ones are chips, and the one being typed filters until a space, a comma or a commit finishes it. */
export function useSearchWords({ value, onSearch, wordEdit }: SearchWordsOptions) {
  const [words, setWords] = useState(() => splitWords(value));
  const [draft, setDraft] = useState('');
  // What the draft started as when it was a chip: abandoning the draft makes it one again
  const [takenBack, setTakenBack] = useState<string | null>(null);

  const editedWords = wordEdit ? [...new Set(words.flatMap((other) => (other === wordEdit.word ? splitWords(wordEdit.text) : [other])))] : words;
  const query = joinQuery(editedWords, draft);
  const typedQuery = useDebounce(query, typingPause);
  const sentRef = useRef(value);
  const typingWord = draft.trim();

  const send = (next: string, typing = '') => {
    sentRef.current = next;
    onSearch(next, typing);
  };

  useEffect(() => {
    if (typedQuery !== sentRef.current) send(typedQuery, typingWord);
  }, [typedQuery]);

  // A change from outside, such as a reset, a recent search or the back button
  useEffect(() => {
    if (value === sentRef.current) return;
    sentRef.current = value;
    setWords(splitWords(value));
    setDraft('');
    setTakenBack(null);
  }, [value]);

  const withWord = (list: string[], word: string | null) => (word && !list.includes(word) ? [...list, word] : list);

  /** Makes the word being typed a chip and applies at once; returns the resulting query. */
  const commitDraft = () => {
    const nextWords = withWord(words, typingWord);
    setWords(nextWords);
    setDraft('');
    setTakenBack(null);
    const next = joinQuery(nextWords, '');
    if (next !== sentRef.current) send(next);
    return next;
  };

  /** Leaves the input without using it: a word taken back into it returns to its chip. */
  const abandonDraft = () => {
    if (!draft) return;
    const nextWords = withWord(words, takenBack);
    setWords(nextWords);
    setDraft('');
    setTakenBack(null);
    send(joinQuery(nextWords, ''));
  };

  const typeInput = (next: string, event: Event) => {
    const parts = isComposing(event) ? [next] : next.split(wordSeparators);
    const finished = parts.slice(0, -1).filter((part) => part && !words.includes(part));
    const nextDraft = parts.at(-1) ?? '';
    if (finished.length) setWords([...words, ...finished]);
    if (!nextDraft) setTakenBack(null);
    setDraft(nextDraft);
  };

  const removeWord = (removed: string) => {
    const next = (wordEdit?.word === removed ? words : editedWords).filter((other) => other !== removed);
    setWords(next);
    send(joinQuery(next, draft));
  };

  /** Brings a finished word back into the input to retype it; a word being typed there becomes a chip. */
  const takeBackWord = (word: string) => {
    setWords(
      withWord(
        words.filter((other) => other !== word),
        typingWord,
      ),
    );
    setDraft(word);
    setTakenBack(word);
  };

  /** Backspace in an empty input: returns whether a word came back. */
  const takeBackLastWord = () => {
    const lastWord = words.at(-1);
    if (lastWord) takeBackWord(lastWord);
    return !!lastWord;
  };

  /** Keeps the edit in place as finished words. */
  const saveWordEdit = () => setWords(editedWords);

  /** Forgets every word; the caller's reset writes the empty search. */
  const clearWords = () => {
    setWords([]);
    setDraft('');
    setTakenBack(null);
    sentRef.current = '';
  };

  return {
    words,
    draft,
    typingWord,
    query,
    /** The typed words still wait to apply: a count of the applied search belongs to an earlier one. */
    isPending: query !== value,
    commitDraft,
    abandonDraft,
    typeInput,
    removeWord,
    takeBackWord,
    takeBackLastWord,
    saveWordEdit,
    clearWords,
  };
}

"use client";

/**
 * The long setup lists shared by screens 5 and 13 (design system `.folds`,
 * `.fold`, `.search`, `.inline-edit`, `.add-row`): accounts by group, and the
 * owner's income and expense groups. Names are only ever shown as text.
 */
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { cleanName, groupNameProblem, plainOnly } from "../../lib/setup/group-names.ts";
import { ACCOUNT_GROUPS, GROUP_LIMIT } from "../../lib/setup/setup.ts";
import { ConfirmDialog } from "./confirm-dialog.tsx";
import { categoryName, groupIcon, matchCount } from "./format.ts";
import { Icon } from "./icons.tsx";
import { Picker } from "./picker.tsx";

/* ---------- The draft both screens edit ---------- */

export interface OwnerGroup {
  id: string;
  name: string;
}

export interface GroupDraft {
  groups: OwnerGroup[];
  /** One per category: a group's id, or "" for Not grouped. */
  values: string[];
}

export interface Draft {
  /** One per account: a group, or "" for none. */
  accounts: string[];
  income: GroupDraft;
  expense: GroupDraft;
}

export interface SetupPageData {
  version: number;
  firstTime: boolean;
  accounts: Array<{ name: string; group: string }>;
  income: { names: string[]; categories: Array<{ name: string; subcategories: string[]; group: number | null }> };
  expense: { names: string[]; categories: Array<{ name: string; subcategories: string[]; group: number | null }> };
}

let nextId = 0;
export const newGroupId = (): string => `g${(nextId += 1)}`;

function groupDraft(list: SetupPageData["income"]): GroupDraft {
  const groups = list.names.map((name) => ({ id: newGroupId(), name }));
  return { groups, values: list.categories.map((category) => (category.group === null ? "" : (groups[category.group]?.id ?? ""))) };
}

export function draftFrom(page: SetupPageData, accounts: string[]): Draft {
  return { accounts, income: groupDraft(page.income), expense: groupDraft(page.expense) };
}

/** What the save route reads: positions only, so no name from the file travels back. */
export function answersOf(draft: Draft): string {
  const list = (groups: GroupDraft) => ({
    names: groups.groups.map((group) => group.name),
    categories: groups.values.map((id) => {
      const index = groups.groups.findIndex((group) => group.id === id);
      return index === -1 ? null : index;
    }),
  });
  return JSON.stringify({ accounts: draft.accounts, income: list(draft.income), expense: list(draft.expense) });
}

/** Two drafts give the same answers, whatever the group ids. */
export const sameAnswers = (a: Draft, b: Draft): boolean => answersOf(a) === answersOf(b);

const plural = (count: number, one: string, many: string): string => (count === 0 ? `No ${many}` : count === 1 ? `1 ${one}` : `${count} ${many}`);

/* ---------- Groups that open and close, with a search ---------- */

interface FoldRow {
  index: number;
  search: string;
  node: ReactNode;
}

interface FoldSpec {
  key: string;
  name: string;
  /** Lower case, or "" for a group whose name doesn't take part in search. */
  search: string;
  sum: string;
  glyph?: "bank" | "card" | "wallet" | "trend" | "people" | "case" | "q";
  rows: FoldRow[];
  menu?: ReactNode;
  /** Shown in place of the group's row while it's being renamed. */
  head?: ReactNode;
}

export interface Reveal {
  key: string;
  token: number;
  clearSearch: boolean;
}

function FoldList(props: {
  id: string;
  placeholder: string;
  folds: FoldSpec[];
  initialOpen: string[];
  /** Rows move to their new group: on open or close, a search change, or a fresh show. */
  onSettle: () => void;
  reveal?: Reveal | null;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set(props.initialOpen));
  const [searchOpen, setSearchOpen] = useState<Set<string>>(new Set());
  const input = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();

  const shown = props.folds.map((fold) => {
    const groupHit = q !== "" && fold.search !== "" && fold.search.includes(q);
    const rows = fold.rows.filter((row) => q === "" || groupHit || row.search.includes(q));
    return { fold, rows, groupHit, visible: q === "" || groupHit || rows.length > 0 };
  });
  const visible = shown.filter((item) => item.visible);
  const matches = matchCount(visible);

  function search(text: string) {
    props.onSettle();
    setQuery(text);
    const next = text.trim().toLowerCase();
    if (next === "") return;
    // Every group with a match opens while searching. Clearing puts back the groups the owner had open.
    setSearchOpen(new Set(props.folds.filter((fold) => (fold.search !== "" && fold.search.includes(next)) || fold.rows.some((row) => row.search.includes(next))).map((fold) => fold.key)));
  }

  function clear() {
    search("");
    input.current?.focus();
  }

  function toggle(key: string) {
    props.onSettle();
    const update = (set: Set<string>) => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    };
    if (q === "") setOpen(update);
    else setSearchOpen(update);
  }

  const revealToken = props.reveal?.token;
  useEffect(() => {
    const reveal = props.reveal;
    if (!reveal) return;
    if (reveal.clearSearch) setQuery("");
    setOpen((set) => new Set([...set, reveal.key]));
    // Only a new token asks again.
  }, [revealToken]);

  return (
    <>
      <div className="search">
        <Icon name="search" />
        <label className="sr" htmlFor={`q-${props.id}`}>
          {props.placeholder}
        </label>
        <input
          ref={input}
          className="input"
          type="search"
          id={`q-${props.id}`}
          placeholder={props.placeholder}
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => search(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query !== "") {
              event.preventDefault();
              clear();
            }
          }}
        />
        {query !== "" && (
          <button className="input-wrap__btn" type="button" aria-label="Clear search" onClick={clear}>
            <Icon name="x" />
          </button>
        )}
      </div>
      <p className="search__count" aria-live="polite">
        {q === "" || visible.length === 0 ? "" : matches === 1 ? "1 match" : `${matches} matches`}
      </p>
      <div className="folds" hidden={q !== "" && visible.length === 0}>
        {shown.map(({ fold, rows, visible: on }) => {
          const isOpen = q === "" ? open.has(fold.key) : searchOpen.has(fold.key);
          const bodyId = `fb-${props.id}-${fold.key || "none"}`;
          return (
            <div className={`fold ${fold.glyph ? "fold--glyph" : ""}`} key={fold.key || "none"} hidden={!on}>
              {fold.head ?? (
                <div className="fold__head">
                  <button
                    className="fold__btn"
                    type="button"
                    id={`fh-${props.id}-${fold.key || "none"}`}
                    aria-expanded={isOpen}
                    aria-controls={bodyId}
                    onClick={() => toggle(fold.key)}
                  >
                    {fold.glyph && (
                      <span className="glyph">
                        <Icon name={fold.glyph} />
                      </span>
                    )}
                    <span className="fold__text">
                      <span className="fold__name">{fold.name}</span>
                      <span className="fold__sum">{fold.sum}</span>
                    </span>
                    <Icon name="chev" className="fold__chev" />
                  </button>
                  {fold.menu}
                </div>
              )}
              <div className="fold__body" id={bodyId} hidden={!isOpen}>
                {fold.rows.length > 0 ? <div className="pick-rows">{rows.map((row) => row.node)}</div> : <p className="fold__empty">Nothing in this group yet.</p>}
              </div>
            </div>
          );
        })}
      </div>
      {q !== "" && visible.length === 0 && (
        <div className="search__none">
          <span>Nothing matches “{query.trim()}”.</span>
          <button className="link" type="button" onClick={clear}>
            Clear search
          </button>
        </div>
      )}
    </>
  );
}

/** Where each row sits. It only moves when the list settles, so nothing jumps under the pointer. */
function useHome(values: string[], settleKey: number) {
  const [home, setHome] = useState(values);
  const latest = useRef(values);
  latest.current = values;
  useEffect(() => setHome(latest.current), [settleKey]);
  // A row the list hasn't seen yet sits where it belongs.
  const safeHome = home.length === values.length ? home : values;
  return { home: safeHome, settle: () => setHome(latest.current) };
}

/* ---------- Accounts ---------- */

export function AccountList(props: {
  id: string;
  names: string[];
  values: string[];
  suggested: boolean[];
  firstTime: boolean;
  showErrors: boolean;
  disabled: boolean;
  settleKey: number;
  reveal: Reveal | null;
  onPick: (index: number, group: string) => void;
}) {
  const { home, settle } = useHome(props.values, props.settleKey);
  const emptyName = props.firstTime ? "Needs a group" : "Ungrouped";
  const choices = useMemo(
    () => [...(props.firstTime ? [] : [{ value: "", label: "Ungrouped" }]), ...ACCOUNT_GROUPS.map((group) => ({ value: group, label: group }))],
    [props.firstTime],
  );

  const folds: FoldSpec[] = ["", ...ACCOUNT_GROUPS].map((group) => ({
    key: group,
    name: group === "" ? emptyName : group,
    search: (group === "" ? emptyName : group).toLowerCase(),
    sum: plural(props.values.filter((value) => value === group).length, "account", "accounts"),
    glyph: group === "" ? "q" : groupIcon(group),
    rows: props.names.flatMap((name, index) => {
      if (home[index] !== group) return [];
      const value = props.values[index] ?? "";
      const moved = group !== "" && value !== group;
      const bad = props.showErrors && value === "";
      return [
        {
          index,
          search: name.toLowerCase(),
          node: (
            <div className={`pick-row pick-row--plain ${bad ? "is-bad" : ""}`} key={index}>
              <div className="pick-row__name">
                <span>{name}</span>
                {props.suggested[index] && <span className="tag">Suggested</span>}
                {moved && <span className="tag">Moved to {value === "" ? "Ungrouped" : value}</span>}
              </div>
              <Picker
                id={`${props.id}-pick-${index}`}
                label={`Group for ${name}`}
                value={value}
                choices={choices}
                placeholder="Choose a group"
                invalid={bad}
                describedBy={bad ? `${props.id}-err-${index}` : undefined}
                disabled={props.disabled}
                onPick={(group) => props.onPick(index, group)}
              />
              {bad && (
                <p className="field__error" id={`${props.id}-err-${index}`}>
                  <Icon name="alert" />
                  Choose a group.
                </p>
              )}
            </div>
          ),
        },
      ];
    }),
  }));

  return <FoldList id={props.id} placeholder="Find an account" folds={folds} initialOpen={[""]} onSettle={settle} reveal={props.reveal} />;
}

/* ---------- Income and expense groups ---------- */

const NAME_WORDS = {
  EMPTY: () => "Give the group a name.",
  TOO_LONG: () => "Use 40 characters or fewer.",
  RESERVED: () => "“Not grouped” is kept for categories without a group.",
  TAKEN: (name: string) => `You already have a group called “${name}”.`,
  NOT_PLAIN: () => "Give the group a name.",
} as const;

// Line breaks, control, direction-changing and invisible characters can't be part of a
// one-line name, so they never reach the field. The server refuses them (group-names.ts).

function NameField(props: { mode: "add" | "rename"; initial: string; others: string[]; onSave: (name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(props.initial);
  const [tried, setTried] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const found = groupNameProblem(value, props.others);
  const error = tried && found !== null ? NAME_WORDS[found.problem](found.takenBy ?? "") : null;

  useEffect(() => {
    field.current?.focus();
    if (props.mode === "rename") field.current?.select();
  }, [props.mode]);

  function save() {
    setTried(true);
    if (found !== null) {
      field.current?.focus();
      return;
    }
    props.onSave(cleanName(value));
  }

  return (
    <div className={`inline-edit ${error ? "is-bad" : ""}`}>
      <label className="field__label" htmlFor="group-name">
        {props.mode === "add" ? "New group name" : "Group name"}
      </label>
      <div className="inline-edit__row">
        <input
          ref={field}
          className="input"
          id="group-name"
          value={value}
          autoComplete="off"
          spellCheck={false}
          aria-describedby="group-name-msg"
          aria-invalid={error ? true : undefined}
          onChange={(event) => setValue(plainOnly(event.target.value))}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              save();
            } else if (event.key === "Escape") {
              event.preventDefault();
              props.onCancel();
            }
          }}
        />
        <button className="btn" type="button" onClick={save}>
          {props.mode === "add" ? "Add group" : "Rename"}
        </button>
        <button className="btn btn--quiet" type="button" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
      {error ? (
        <p className="field__error" id="group-name-msg">
          <Icon name="alert" />
          <span>{error}</span>
        </p>
      ) : (
        <p className="field__hint" id="group-name-msg">
          Up to 40 characters.
        </p>
      )}
    </div>
  );
}

function GroupMenu(props: { id: string; name: string; disabled: boolean; onRename: () => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>(".pop__opt")?.focus();
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function onKey(event: KeyboardEvent) {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      button.current?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const items = [...(root.current?.querySelectorAll<HTMLButtonElement>(".pop__opt") ?? [])];
      const at = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    }
  }

  const pick = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div className="menu" ref={root} onKeyDown={onKey}>
      <button
        ref={button}
        id={props.id}
        className="btn btn--sm btn--icon btn--quiet"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Options for ${props.name}`}
        disabled={props.disabled}
        onClick={() => setOpen(!open)}
      >
        <Icon name="more" />
      </button>
      {open && (
        <div className="pop" role="menu">
          <button className="pop__opt" role="menuitem" type="button" onClick={pick(props.onRename)}>
            <span>Rename</span>
          </button>
          <button className="pop__opt" role="menuitem" type="button" onClick={pick(props.onRemove)}>
            <span>Remove</span>
          </button>
        </div>
      )}
    </div>
  );
}

type Editing = { mode: "add" } | { mode: "rename"; id: string } | null;

export function CategoryGroups(props: {
  id: string;
  categories: Array<{ name: string; subcategories: string[] }>;
  draft: GroupDraft;
  example: string;
  firstTime: boolean;
  disabled: boolean;
  settleKey: number;
  onChange: (draft: GroupDraft) => void;
}) {
  const { groups, values } = props.draft;
  const { home, settle } = useHome(values, props.settleKey);
  const [editing, setEditing] = useState<Editing>(null);
  const [removing, setRemoving] = useState<OwnerGroup | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [focusTo, setFocusTo] = useState<string | null>(null);
  const nameOf = (id: string) => (id === "" ? "Not grouped" : (groups.find((group) => group.id === id)?.name ?? "Not grouped"));
  const choices = [{ value: "", label: "Not grouped" }, ...groups.map((group) => ({ value: group.id, label: group.name }))];

  useEffect(() => {
    if (focusTo === null) return;
    document.getElementById(focusTo)?.focus();
    setFocusTo(null);
  }, [focusTo]);

  const headId = (key: string) => `fh-${props.id}-${key || "none"}`;
  const menuId = (key: string) => `fo-${props.id}-${key}`;

  function add(name: string) {
    const id = newGroupId();
    props.onChange({ groups: [...groups, { id, name }], values });
    setEditing(null);
    // Not grouped opens by itself with the first group, because then there's something to do in it.
    if (groups.length === 0) setReveal({ key: "", token: Date.now(), clearSearch: false });
    setFocusTo(headId(id));
  }

  function rename(id: string, name: string) {
    props.onChange({ groups: groups.map((group) => (group.id === id ? { ...group, name } : group)), values });
    setEditing(null);
    setFocusTo(headId(id));
  }

  function remove(id: string) {
    settle();
    props.onChange({ groups: groups.filter((group) => group.id !== id), values: values.map((value) => (value === id ? "" : value)) });
    setRemoving(null);
    setFocusTo(headId(""));
  }

  function askRemove(group: OwnerGroup) {
    const count = values.filter((value) => value === group.id).length;
    if (count === 0) remove(group.id);
    else setRemoving(group);
  }

  const othersThan = (id: string | null) => groups.filter((group) => group.id !== id).map((group) => group.name);

  const folds: FoldSpec[] = [{ id: "", name: "Not grouped" }, ...groups].map((group) => ({
    key: group.id,
    name: group.name,
    search: group.id === "" ? "" : group.name.toLowerCase(),
    sum: plural(values.filter((value) => value === group.id).length, "category", "categories"),
    menu:
      group.id === "" ? undefined : (
        <GroupMenu id={menuId(group.id)} name={group.name} disabled={props.disabled} onRename={() => setEditing({ mode: "rename", id: group.id })} onRemove={() => askRemove(group)} />
      ),
    head:
      editing?.mode === "rename" && editing.id === group.id ? (
        <NameField
          mode="rename"
          initial={group.name}
          others={othersThan(group.id)}
          onSave={(name) => rename(group.id, name)}
          onCancel={() => {
            setEditing(null);
            setFocusTo(headId(group.id));
          }}
        />
      ) : undefined,
    rows: props.categories.flatMap((category, index) => {
      // A row whose group was removed reads Not grouped straight away.
      const at = groups.some((g) => g.id === home[index]) ? home[index] : "";
      if (at !== group.id) return [];
      const value = values[index] ?? "";
      return [
        {
          index,
          search: [category.name, ...category.subcategories].join(" ").toLowerCase(),
          node: (
            <div className="pick-row pick-row--plain" key={index}>
              <div>
                <div className="pick-row__name">
                  <span>{categoryName(category.name)}</span>
                  {value !== group.id && <span className="tag">Moved to {nameOf(value)}</span>}
                </div>
                {category.subcategories.length > 0 && <div className="pick-row__sub">{category.subcategories.join(" · ")}</div>}
              </div>
              {groups.length > 0 && (
                <Picker
                  label={`Group for ${categoryName(category.name)}`}
                  value={value}
                  choices={choices}
                  disabled={props.disabled}
                  onPick={(id) => props.onChange({ groups, values: values.map((old, at2) => (at2 === index ? id : old)) })}
                />
              )}
            </div>
          ),
        },
      ];
    }),
  }));

  const count = groups.length;
  const removingCount = removing === null ? 0 : values.filter((value) => value === removing.id).length;

  return (
    <>
      <FoldList
        id={props.id}
        placeholder="Find a category"
        folds={folds}
        initialOpen={props.firstTime && count === 0 ? [] : [""]}
        onSettle={settle}
        reveal={reveal}
      />
      {editing?.mode === "add" ? (
        <NameField
          mode="add"
          initial=""
          others={othersThan(null)}
          onSave={add}
          onCancel={() => {
            setEditing(null);
            setFocusTo(`add-${props.id}`);
          }}
        />
      ) : (
        <div className="add-row">
          {count >= GROUP_LIMIT ? (
            <p className="field__hint">You have 12 groups, the most you can have. Remove one to add another.</p>
          ) : (
            <>
              <button className="btn btn--sm" type="button" id={`add-${props.id}`} disabled={props.disabled} onClick={() => setEditing({ mode: "add" })}>
                <Icon name="plus" />
                Add a group
              </button>
              <p className="field__hint">{count > 0 ? `${count} of 12 groups.` : `Up to 12 groups, such as ${props.example}.`}</p>
            </>
          )}
        </div>
      )}
      {removing !== null && (
        <ConfirmDialog
          title={`Remove “${removing.name}”?`}
          safeLabel="Keep group"
          actionLabel="Remove group"
          danger
          onSafe={() => {
            setRemoving(null);
            // Keep group, or Esc: back to the Options button that opened the menu (design.md, as on screen 13).
            setFocusTo(menuId(removing.id));
          }}
          onAction={() => remove(removing.id)}
        >
          <p>
            {removingCount === 1 ? "Its 1 category goes" : `Its ${removingCount} categories go`} back to Not grouped.
            {props.firstTime ? "" : " Nothing changes until you save."}
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}

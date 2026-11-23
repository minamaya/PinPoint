# Modal Archetypes (§17)

FormDialog / ConfirmDialog patterns, sizing, footer layout, and composer surfaces.

## 17. Modal Archetypes

Two canonical modal patterns, plus one dismissal standard for any modal that holds input. Use shadcn primitives directly; don't extract a composite unless duplication exceeds rule-of-three.

### FormDialog pattern (create/edit in a modal)

A FormDialog holds input, so it follows the dismissal standard below (`dirty`, Cancel as a `DialogClose`).

```tsx
<Dialog open={open} onOpenChange={setOpen} dirty={isDirty}>
  <DialogTrigger asChild>
    <Button variant="outline">Edit</Button>
  </DialogTrigger>
  <DialogContent className="sm:max-w-lg">
    <DialogHeader>
      <DialogTitle>Edit machine</DialogTitle>
      <DialogDescription>Update the name and location.</DialogDescription>
    </DialogHeader>
    <form action={updateMachine} className="space-y-4">
      <!-- fields -->
      <DialogFooter>
        <DialogClose asChild><Button variant="outline" type="button">Cancel</Button></DialogClose>
        <Button type="submit">Save</Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
```

### Dismissal standard (modals that hold input)

Any Dialog, Sheet or Drawer that holds user input follows one standard, built into the primitives and opted into with `dirty` (CORE-UI-009). Never write a per-modal version.

- **Outside clicks do nothing.** Clicking the backdrop never closes the modal.
- **Unsaved changes are confirmed.** Escape, the close X, Cancel and a swipe-down on a Drawer open "Discard changes?" (AlertDialog archetype below; buttons Keep editing / Discard). With no unsaved changes they close at once.
- **Closing from code is not guarded.** `setOpen(false)` after a successful save closes without asking.

```tsx
<Dialog open={open} onOpenChange={setOpen} dirty={name !== initialName}>
  <DialogContent>
    ...
    <DialogFooter>
      <DialogClose asChild>
        <Button type="button" variant="outline">
          Cancel
        </Button>
      </DialogClose>
      <Button type="submit">Save</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- Pass `dirty` as a boolean on every render. Compare current state with the value at open, or test "not empty" on a create form. A native form of uncontrolled fields uses `useFormDirty()` (`~/hooks/use-form-dirty`): `dirty` on the root, `{...formProps}` on the `<form>`.
- Cancel is a `DialogClose` / `SheetClose` / `DrawerClose`, not `onClick={() => setOpen(false)}`, so it passes through the guard.
- `onDiscard` runs on Discard, before the modal closes. Use it when the draft outlives the modal and is not reset on open (the issue and machine-note composers clear their stored draft there).
- A modal whose controls save as they are used (a tag picker, a share panel) passes `dirty={false}`: outside clicks still do nothing, and it closes at once.
- A modal with nothing to type into (a pure confirm, a viewer, a picker that applies each choice at once) is listed in `READ_ONLY_MODALS` in `src/components/ui/modal-dismissal-guard.test.ts` with a reason; the test fails for any other modal that omits `dirty`.
- The copy is fixed: title "Discard changes?", description "Unsaved changes will be lost.", buttons "Keep editing" and "Discard". `DiscardChangesDialog` renders it, and `useUnsavedChangesGuard` (page navigation) renders the same component.

### ConfirmDialog pattern (destructive confirmations)

```tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Delete</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete machine?</AlertDialogTitle>
      <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={deleteMachine}>Delete</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### Sizing

| Size    | Class                 | Use case                                    |
| :------ | :-------------------- | :------------------------------------------ |
| Default | (no override)         | Short confirmation prompts                  |
| Medium  | `sm:max-w-lg`         | Most forms (2-6 fields)                     |
| Large   | `sm:max-w-xl` / `2xl` | Forms with rich content (editors, previews) |

### Footer layout

`DialogFooter` uses `flex flex-col-reverse gap-2 sm:flex-row sm:justify-end`. Write the buttons in source order as `[Cancel, Save]` (or `[Cancel, Delete]` for AlertDialog). That renders:

- **Mobile** (`flex-col-reverse`): primary action (Save/Delete) on top, Cancel below. The reversal intentionally puts the primary action above the fold / closer to the focus point for small-screen readers.
- **Desktop** (`sm:flex-row sm:justify-end`): horizontal row on the bottom-right, Cancel left, primary action rightmost — matching the standard "primary action anchors the right edge" convention.

Do not reorder the buttons to try to "fix" the mobile stack — the reversal is by design.

### Rules

- Never build a custom `Modal` or `Drawer` component — Dialog / AlertDialog / Sheet cover every case.
- Never put a `<form>` inside a `DropdownMenuItem` — Radix closes the dropdown before the form submits. Use `onSelect={() => serverAction()}` instead.
- Never wrap a Server Action in an inline async function: `action={async () => await serverAction()}` breaks Next.js form handling (CORE-ARCH-005). Pass the Server Action directly: `action={serverAction}`.
- For destructive confirmations, use `AlertDialog` — it has semantics (`role="alertdialog"`) that screen readers announce more urgently.
- **Target, not current behavior:** when opening any modal, set `inert` on the page-root container (CORE-A11Y-006). Radix already applies `aria-hidden` + pointer-events to the background; `inert` is the platform primitive that also removes it from tab order. **Nothing implements this yet** — it's adopted and tracked as PP-kqbk.8, so an empty search for `inert` means "not built", not "decided against". Don't add a partial version per modal; it goes on the background container once. Detail: `pinpoint-ui` skill → `references/accessibility.md`.
- Native `<dialog>.showModal()` is Baseline Widely available, but it is **not** the default for product UI — shadcn `<Dialog>` / `<AlertDialog>` / `<Sheet>` are. Reach for `<dialog>` only for one-off, self-contained, single-purpose surfaces that don't earn a place in the shadcn variant system (e.g., a debug-only inspector, a tightly-scoped help blurb). See `pinpoint-ui` skill § "Native HTML primitives alongside shadcn/Radix".

### Composer surfaces (mobile bottom sheet + quick→full editor)

Any surface whose primary job is **composing free-form rich text** (timeline notes, issue comments, and future equivalents) follows two rules. Length-limited single-line fields — titles, names, search boxes — are explicitly **exempt**; these rules are about multi-line writing surfaces only.

1. **Bottom sheet on mobile.** On small screens a composer SHOULD open in a bottom `<Sheet side="bottom">`, not an inline block buried in the page. The sheet owns the keyboard-adjusted viewport so the editor and its Post button stay visible while typing, and the capture affordance is reachable without scrolling past existing content. On desktop the composer may render inline (or in a side sheet / dialog when triggered from a header action). One composer component, viewport-aware presentation — do not fork into two components.

2. **Quick → full editor transition.** The editor opens in **quick mode**: the formatting toolbar is hidden so it reads as a fast jot, not a document. A single toggle (a "format"/`Aa` button beside the primary controls) reveals the full toolbar; the toggle is **two-way** (content is always stored as the same rich-text document regardless of mode, so flipping back is lossless). Default to the lightest classification (e.g. the timeline composer defaults its tag to `note`) and never block submit on a classification the author has not been asked to make. Support `Cmd`/`Ctrl`+`Enter` to submit.

The timeline composer (PP-0x98) establishes the basic pattern; generalizing it across every mobile editor and extracting a shared primitive is tracked separately (do it on the third use site, per rule-of-three — §17 intro).

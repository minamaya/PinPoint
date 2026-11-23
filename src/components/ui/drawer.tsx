"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import {
  GuardedModal,
  UnguardedModal,
  useIgnoreOutsideInteraction,
  useModalDismissal,
  type ModalDismissalProps,
} from "~/components/ui/modal-dismissal";
import { cn } from "~/lib/utils";

/**
 * Pass `dirty` on any Drawer that holds user input: outside clicks are ignored
 * and unsaved changes are confirmed before the drawer closes, including on a
 * swipe-down (CORE-UI-009).
 */
function Drawer({
  dirty,
  onDiscard,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root> &
  ModalDismissalProps): React.JSX.Element {
  if (dirty === undefined) {
    return (
      <UnguardedModal>
        <DrawerPrimitive.Root data-slot="drawer" {...props} />
      </UnguardedModal>
    );
  }
  return (
    <GuardedModal
      dirty={dirty}
      onDiscard={onDiscard}
      open={props.open}
      defaultOpen={props.defaultOpen}
      onOpenChange={props.onOpenChange}
    >
      {(root) => (
        <DrawerPrimitive.Root data-slot="drawer" {...props} {...root} />
      )}
    </GuardedModal>
  );
}

function DrawerTrigger(
  props: React.ComponentProps<typeof DrawerPrimitive.Trigger>
): React.JSX.Element {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerPortal(
  props: React.ComponentProps<typeof DrawerPrimitive.Portal>
): React.JSX.Element {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

function DrawerClose(
  props: React.ComponentProps<typeof DrawerPrimitive.Close>
): React.JSX.Element {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>): React.JSX.Element {
  return (
    <DrawerPrimitive.Overlay
      data-slot="drawer-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  );
}

function DrawerContent({
  className,
  children,
  onInteractOutside,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content>): React.JSX.Element {
  const handleInteractOutside = useIgnoreOutsideInteraction(onInteractOutside);
  const guard = useModalDismissal();
  const contentRef = React.useRef<HTMLDivElement>(null);
  const overlayRef = React.useRef<HTMLDivElement>(null);

  // A swipe-down that the discard confirm intercepts leaves vaul's drag
  // transform on the drawer, because the drawer is still open. Snap it back
  // the way vaul's own resetDrawer does.
  React.useEffect(() => {
    if (!guard) return;
    const { closeBlockedRef } = guard;
    closeBlockedRef.current = () => {
      const ease = "0.5s cubic-bezier(0.32, 0.72, 0, 1)";
      const content = contentRef.current;
      if (content) {
        content.style.transition = `transform ${ease}`;
        content.style.transform = "translate3d(0, 0, 0)";
      }
      const overlay = overlayRef.current;
      if (overlay) {
        overlay.style.transition = `opacity ${ease}`;
        overlay.style.opacity = "1";
      }
    };
    return () => {
      closeBlockedRef.current = null;
    };
  }, [guard]);

  return (
    <DrawerPortal data-slot="drawer-portal">
      <DrawerOverlay ref={overlayRef} />
      <DrawerPrimitive.Content
        ref={contentRef}
        data-slot="drawer-content"
        className={cn(
          "group/drawer-content fixed z-50 flex h-auto flex-col bg-background",
          "data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=top]:rounded-b-lg data-[vaul-drawer-direction=top]:border-b",
          "data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[80vh] data-[vaul-drawer-direction=bottom]:rounded-t-lg data-[vaul-drawer-direction=bottom]:border-t",
          "data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=right]:sm:max-w-sm",
          "data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=left]:sm:max-w-sm",
          className
        )}
        {...(handleInteractOutside
          ? { onInteractOutside: handleInteractOutside }
          : {})}
        {...props}
      >
        <div className="mx-auto mt-4 hidden h-2 w-[100px] shrink-0 rounded-full bg-muted group-data-[vaul-drawer-direction=bottom]/drawer-content:block" />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
}

function DrawerHeader({
  className,
  ...props
}: React.ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        "flex flex-col gap-0.5 p-4 group-data-[vaul-drawer-direction=bottom]/drawer-content:text-center group-data-[vaul-drawer-direction=top]/drawer-content:text-center md:gap-1.5 md:text-left",
        className
      )}
      {...props}
    />
  );
}

function DrawerFooter({
  className,
  ...props
}: React.ComponentProps<"div">): React.JSX.Element {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title>): React.JSX.Element {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("font-semibold text-foreground", className)}
      {...props}
    />
  );
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<
  typeof DrawerPrimitive.Description
>): React.JSX.Element {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};

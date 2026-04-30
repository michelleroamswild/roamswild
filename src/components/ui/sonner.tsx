import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// Pine + Paper toast surface. Variant accents (success/pine, error/ember,
// warning/clay, info/water, loading/pine) are applied via [data-type]
// selectors below, and the icon is rendered as a colored circle on the left.
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="top-right"
      offset={16}
      gap={10}
      duration={4500}
      visibleToasts={4}
      closeButton
      className="toaster group"
      toastOptions={{
        unstyled: false,
        classNames: {
          toast:
            "group toast pointer-events-auto " +
            "!bg-white !text-ink !border !border-line !rounded-[14px] " +
            "!shadow-[0_18px_44px_rgba(29,34,24,0.12),0_3px_8px_rgba(29,34,24,0.06)] " +
            "!font-sans !p-4 !gap-3 " +
            "[&>[data-icon]]:!w-9 [&>[data-icon]]:!h-9 [&>[data-icon]]:!rounded-full " +
            "[&>[data-icon]]:!flex [&>[data-icon]]:!items-center [&>[data-icon]]:!justify-center " +
            "[&>[data-icon]>svg]:!w-4 [&>[data-icon]>svg]:!h-4 " +
            // Variant accents — drive icon bg + ring color via the [data-type] hook
            "data-[type=success]:[&>[data-icon]]:!bg-pine-6/15 data-[type=success]:[&>[data-icon]>svg]:!text-pine-6 " +
            "data-[type=error]:[&>[data-icon]]:!bg-ember/15 data-[type=error]:[&>[data-icon]>svg]:!text-ember " +
            "data-[type=warning]:[&>[data-icon]]:!bg-clay/15 data-[type=warning]:[&>[data-icon]>svg]:!text-clay " +
            "data-[type=info]:[&>[data-icon]]:!bg-water/15 data-[type=info]:[&>[data-icon]>svg]:!text-water " +
            "data-[type=loading]:[&>[data-icon]]:!bg-pine-6/15 data-[type=loading]:[&>[data-icon]>svg]:!text-pine-6",
          title:
            "!text-[14px] !font-sans !font-semibold !tracking-[-0.005em] !text-ink !leading-[1.3]",
          description:
            "!text-[13px] !text-ink-3 !leading-[1.5] !mt-0.5",
          actionButton:
            "!bg-pine-6 !text-cream !rounded-full !px-3 !py-1.5 !text-[12px] !font-sans !font-semibold " +
            "hover:!bg-pine-5 !transition-colors",
          cancelButton:
            "!bg-transparent !text-ink !border !border-line !rounded-full !px-3 !py-1.5 !text-[12px] !font-sans !font-semibold " +
            "hover:!bg-ink/5 !transition-colors",
          closeButton:
            "!bg-white !border-line !text-ink-3 hover:!bg-cream hover:!text-ink !rounded-full",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };

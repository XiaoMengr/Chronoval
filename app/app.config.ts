export default defineAppConfig({
  ui: {
      colors: {
        primary: 'neutral',
        secondary: 'slate',
        neutral: 'neutral',
        info: 'sky',
        success: 'emerald',
        warning: 'amber',
        danger: 'rose',
        },
        // 通知（Toast）：仅精修外观，保留默认配色/状态色与底部进度条。
          // 四角圆弧加大；进度条改为贴合底部的细色线（浅色轨道 + 圆角流畅填充），更精致。
          toast: {
            slots: {
              root: 'relative group overflow-hidden bg-default shadow-lg rounded-2xl ring ring-default p-4 flex gap-2.5 focus:outline-none',
              progress: 'absolute bottom-0 inset-x-0 h-1 overflow-hidden rounded-none bg-neutral-200/60 dark:bg-neutral-800/60',
            },
          },
        button: {
      slots: {
        base: 'cursor-pointer',
      },
      variants: {
        variant: {
          // ghost（悬浮于背景内容上）按钮：点击/悬停/聚焦时不要浮出浅灰背景色，
          // 改为完全透明，避免在照片亮背景上显得发白刺眼。
          // 具体透明规则见 assets/css/tailwind.css 中 .ghost-flat 的选择器。
          ghost: 'ghost-flat',
        },
      },
    },
    popover: {
      slots: {
        content:
          'bg-white/70 dark:bg-neutral-900/50 backdrop-blur-3xl ring-0 shadow-lg border border-neutral-300/50 dark:border-neutral-500/50 rounded-lg',
      },
    },
    card: {
      slots: {
        header: 'font-semibold',
      },
      variants: {
        variant: {
          glassmorphism: {
            root: 'shadow-lg divide-y-0 divide-neutral-300/50 dark:divide-neutral-500/50',
            header: 'p-2 sm:p-2 pb-0!',
            body: 'p-2 sm:p-2',
            footer: 'p-2 sm:p-2',
          },
        },
      },
    },
    formField: {
      slots: {
        label: 'mb-1',
        help: 'mt-0.5',
      },
    },
    // 开关（Switch）：「关闭态可辨识 + 尺寸统一」优化 ——
    // 1) 固定轨道尺寸（h-5/w-9），使 checked 与 unchecked 的外框宽高完全一致，
    //    避免原生开启态比关闭态更宽/更高的跳动感；
    // 2) 只给未打开（unchecked）的开关加浅灰底 + 中性描边，使其在浅色背景上
    //    也能一眼看出是一个按钮；开启态完全保持各开关自身的颜色样式
    //    （info 蓝 / success 绿 / primary 等），不加任何额外边框与着色。
    switch: {
      slots: {
        base: 'h-5 w-9 data-[state=unchecked]:border data-[state=unchecked]:border-neutral-300 dark:border-neutral-600 data-[state=unchecked]:bg-neutral-100 dark:data-[state=unchecked]:bg-neutral-800 focus-visible:outline-primary focus-visible:ring-0',
      },
    },
  },
})

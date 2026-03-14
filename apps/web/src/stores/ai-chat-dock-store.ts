import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AIChatDockStore {
	isOpen: boolean;
	setOpen: (isOpen: boolean) => void;
	toggle: () => void;
}

export const useAIChatDockStore = create<AIChatDockStore>()(
	persist(
		(set) => ({
			isOpen: true,
			setOpen: (isOpen) => set({ isOpen }),
			toggle: () => set((state) => ({ isOpen: !state.isOpen })),
		}),
		{
			name: "ai-chat-dock",
			partialize: (state) => ({
				isOpen: state.isOpen,
			}),
		},
	),
);

import { create } from "zustand";

type SilentUpdateStore = {
    suppressSpinnerRef: { current: boolean };
    setSuppressSpinner: (value: boolean) => void;
};

export const useSilentUpdateStore = create<SilentUpdateStore>(() => ({
    suppressSpinnerRef: { current: false },
    setSuppressSpinner: (value) => {
        useSilentUpdateStore.getState().suppressSpinnerRef.current = value;
    },
}));

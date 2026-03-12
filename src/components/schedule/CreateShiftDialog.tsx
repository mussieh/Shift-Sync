"use client";

import { useState, useCallback } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipLoader } from "react-spinners";

import { createShift } from "@/lib/actions/schedule";
import { getSkills } from "@/lib/actions/skills";
import { Location, Skill } from "../../../generated/prisma/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import {
    Popover,
    PopoverTrigger,
    PopoverContent,
} from "@/components/ui/popover";
import { Calendar as CalendarIcon } from "lucide-react";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    locations: Location[];
    userId: string;
    defaultDate?: Date;
}

interface ShiftForm {
    locationId: string;
    date: Date | undefined;
    startTime: string;
    endTime: string;
    isPremium: boolean;
    requirements: Record<string, number>;
}

export default function CreateShiftDialog({
    open,
    onOpenChange,
    locations,
    userId,
    defaultDate,
}: Props) {
    const queryClient = useQueryClient();

    const [form, setForm] = useState<ShiftForm>({
        locationId: "",
        date: defaultDate,
        startTime: "",
        endTime: "",
        isPremium: false,
        requirements: {},
    });

    const setField = useCallback(
        <K extends keyof ShiftForm>(field: K, value: ShiftForm[K]) => {
            setForm((prev) => ({ ...prev, [field]: value }));
        },
        [],
    );

    // ------------------------
    // Fetch skills
    // ------------------------
    const { data: skills = [], isLoading: skillsLoading } = useQuery<Skill[]>({
        queryKey: ["skills"],
        queryFn: getSkills,
        staleTime: 1000 * 60 * 5, // 5 min cache
    });

    // ------------------------
    // Create Shift Mutation
    // ------------------------
    const mutation = useMutation({
        mutationFn: () =>
            createShift(
                userId,
                form.locationId,
                form.date!,
                parseTime(form.date!, form.startTime),
                parseTime(form.date!, form.endTime),
                Object.entries(form.requirements)
                    .filter(([_, qty]) => qty > 0)
                    .map(([skillId, quantity]) => ({ skillId, quantity })),
            ),
        onSuccess: (res) => {
            if (res.success) {
                toast.success("Shift created successfully");
                onOpenChange(false);

                // Reset form
                setForm({
                    locationId: "",
                    date: defaultDate,
                    startTime: "",
                    endTime: "",
                    isPremium: false,
                    requirements: {},
                });

                // Invalidate weekShifts cache
                queryClient.invalidateQueries({ queryKey: ["weekShifts"] });
            } else {
                toast.error(res.error ?? "Failed to create shift");
            }
        },
        onError: (err: unknown) => {
            if (err instanceof Error) toast.error(err.message);
            else toast.error("Failed to create shift");
        },
    });

    // ------------------------
    // Helpers
    // ------------------------
    function parseTime(date: Date, time: string): Date {
        const [h, m] = time.split(":").map(Number);
        const dt = new Date(date);
        dt.setHours(h, m, 0, 0);
        return dt;
    }

    const handleSubmit = () => {
        if (
            !form.locationId ||
            !form.date ||
            !form.startTime ||
            !form.endTime
        ) {
            toast.error("Please fill in all required fields");
            return;
        }

        const requirements = Object.entries(form.requirements)
            .filter(([_, qty]) => qty > 0)
            .map(([skillId, quantity]) => ({ skillId, quantity }));

        if (requirements.length === 0) {
            toast.error("Please add at least one staff requirement");
            return;
        }

        mutation.mutate();
    };

    // ------------------------
    // Render
    // ------------------------
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="fixed top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 max-w-md w-full p-6 rounded-lg shadow-lg grid gap-4 bg-background">
                <DialogHeader>
                    <DialogTitle className="font-bold text-2xl">
                        Create New Shift
                    </DialogTitle>
                </DialogHeader>

                {/* Location */}
                <div>
                    <Label className="mb-2" htmlFor="location">
                        Location
                    </Label>
                    <Select
                        value={form.locationId}
                        onValueChange={(val) => setField("locationId", val)}
                    >
                        <SelectTrigger id="location">
                            <SelectValue placeholder="Select location" />
                        </SelectTrigger>
                        <SelectContent>
                            {locations.map((loc) => (
                                <SelectItem key={loc.id} value={loc.id}>
                                    {loc.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Date Picker */}
                <div>
                    <Label className="mb-2">Date</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                className="w-full justify-start text-left font-normal"
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {form.date
                                    ? format(form.date, "PPP")
                                    : "Pick a date"}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0">
                            <Calendar
                                mode="single"
                                selected={form.date}
                                onSelect={(d) => d && setField("date", d)}
                            />
                        </PopoverContent>
                    </Popover>
                </div>

                {/* Start / End Time */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label className="mb-2">Start Time</Label>
                        <Input
                            type="time"
                            value={form.startTime}
                            onChange={(e) =>
                                setField("startTime", e.target.value)
                            }
                        />
                    </div>
                    <div>
                        <Label className="mb-2">End Time</Label>
                        <Input
                            type="time"
                            value={form.endTime}
                            onChange={(e) =>
                                setField("endTime", e.target.value)
                            }
                        />
                    </div>
                </div>

                {/* Skills */}
                <div>
                    <Label>Staff Requirements</Label>
                    <div className="space-y-2 mt-2">
                        {skillsLoading ? (
                            <div className="flex justify-center py-4">
                                <ClipLoader color="#0E172B" size={22} />
                            </div>
                        ) : (
                            skills.map((skill) => (
                                <div
                                    key={skill.id}
                                    className="flex items-center gap-2"
                                >
                                    <Label className="flex-1 min-w-20">
                                        {skill.name}
                                    </Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        value={form.requirements[skill.id] ?? 0}
                                        onChange={(e) =>
                                            setField("requirements", {
                                                ...form.requirements,
                                                [skill.id]: Number(
                                                    e.target.value,
                                                ),
                                            })
                                        }
                                    />
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Buttons */}
                <div className="flex gap-2 mt-4">
                    <Button
                        onClick={handleSubmit}
                        disabled={mutation.isPending}
                        className="flex-1"
                    >
                        {mutation.isPending ? (
                            <ClipLoader size={18} color="#fff" />
                        ) : (
                            "Create Shift"
                        )}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

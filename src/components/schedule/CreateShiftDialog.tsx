"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { Location, Skill } from "../../../generated/prisma/client";
import { createShift } from "@/lib/actions/schedule";
import { getSkills } from "@/lib/actions/skills";
import { Input } from "../ui/input";
import { GridLoader } from "react-spinners";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    locations: Location[];
    userId: string;
    defaultDate?: Date;
}

export default function CreateShiftDialog({
    open,
    onOpenChange,
    locations,
    userId,
    defaultDate,
}: Props) {
    const [skills, setSkills] = useState<Skill[]>([]);
    const [loading, setLoading] = useState(false);

    const [locationId, setLocationId] = useState<string>("");
    const [date, setDate] = useState<Date | undefined>(defaultDate);
    const [startTime, setStartTime] = useState<string>("");
    const [endTime, setEndTime] = useState<string>("");
    const [isPremium, setIsPremium] = useState<boolean>(false);
    const [requirements, setRequirements] = useState<Record<string, number>>(
        {},
    );
    const [skillsLoading, setSkillsLoading] = useState(false);

    useEffect(() => {
        if (!open) return;

        const loadSkills = async () => {
            setSkillsLoading(true); // start loading
            try {
                const skills = await getSkills();
                setSkills(skills);
            } catch (err) {
                console.error(err);
                toast.error("Failed to load skills");
            } finally {
                setSkillsLoading(false); // stop loading
            }
        };

        loadSkills();
    }, [open]);

    const handleSubmit = async () => {
        if (!locationId || !date || !startTime || !endTime) {
            toast.error("Please fill in all required fields");
            return;
        }

        setLoading(true);
        try {
            const [sh, sm] = startTime.split(":").map(Number);
            const [eh, em] = endTime.split(":").map(Number);

            const startDateTime = new Date(date);
            startDateTime.setHours(sh, sm, 0, 0);

            const endDateTime = new Date(date);
            endDateTime.setHours(eh, em, 0, 0);

            if (endDateTime <= startDateTime)
                endDateTime.setDate(endDateTime.getDate() + 1);

            const reqArray = Object.entries(requirements)
                .filter(([, qty]) => qty > 0)
                .map(([skillId, quantity]) => ({ skillId, quantity }));

            await createShift(
                userId,
                locationId,
                date,
                startDateTime,
                endDateTime,
                reqArray,
                isPremium,
            );

            toast.success("Shift created successfully");
            onOpenChange(false);

            // Reset form
            setLocationId("");
            setDate(defaultDate);
            setStartTime("");
            setEndTime("");
            setIsPremium(false);
            setRequirements({});
        } catch (err: unknown) {
            toast.error(
                err instanceof Error ? err.message : "Failed to create shift",
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-md sm:max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out">
                <DialogHeader className="flex flex-col gap-2 text-center sm:text-left">
                    <DialogTitle className="text-lg leading-none font-semibold">
                        Create New Shift
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 mt-2">
                    {/* Location */}
                    <div>
                        <Label
                            htmlFor="location"
                            className="flex items-center gap-2 text-sm leading-none font-medium select-none mb-2"
                        >
                            Location
                        </Label>
                        <Select
                            value={locationId}
                            onValueChange={setLocationId}
                        >
                            <SelectTrigger
                                id="location"
                                className="border-input flex w-full items-center justify-between gap-2 rounded-md border bg-input-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <SelectValue placeholder="Select location" />
                            </SelectTrigger>
                            <SelectContent className="bg-background rounded-md border shadow-md p-2">
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
                        <Label className="flex items-center gap-2 text-sm leading-none font-medium select-none mb-2">
                            Date
                        </Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    data-empty={!date}
                                    className="w-full justify-start text-left font-normal data-[empty=true]:text-muted-foreground"
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {date ? (
                                        format(date, "PPP")
                                    ) : (
                                        <span>Pick a date</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-full p-0">
                                <Calendar
                                    mode="single"
                                    selected={date}
                                    onSelect={(d) => d && setDate(d)}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Start / End Time */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label
                                htmlFor="startTime"
                                className="flex items-center gap-2 text-sm leading-none font-medium select-none mb-2"
                            >
                                Start Time
                            </Label>
                            <Input
                                id="startTime"
                                type="time"
                                className="border-input flex h-9 w-full min-w-0 rounded-md border px-3 py-1 bg-input-background outline-none"
                                value={startTime}
                                onChange={(e) => setStartTime(e.target.value)}
                            />
                        </div>
                        <div>
                            <Label
                                htmlFor="endTime"
                                className="flex items-center gap-2 text-sm leading-none font-medium select-none mb-2"
                            >
                                End Time
                            </Label>
                            <Input
                                id="endTime"
                                type="time"
                                className="border-input flex h-9 w-full min-w-0 rounded-md border px-3 py-1 bg-input-background outline-none"
                                value={endTime}
                                onChange={(e) => setEndTime(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Premium */}
                    <div className="flex items-center space-x-2 my-10">
                        <Checkbox
                            id="premium"
                            checked={isPremium}
                            onCheckedChange={(v) => setIsPremium(v as boolean)}
                        />
                        <Label htmlFor="premium" className="cursor-pointer">
                            Premium Shift (Friday/Saturday evening)
                        </Label>
                    </div>

                    {/* Skill Requirements */}
                    <div>
                        <Label className="flex items-center gap-2 text-sm leading-none font-medium select-none">
                            Staff Requirements
                        </Label>
                        <div className="space-y-2 mt-2">
                            {skillsLoading ? (
                                <div className="flex justify-center py-4">
                                    <GridLoader color="#0E172B" size={10} />
                                </div>
                            ) : (
                                skills.map((skill) => (
                                    <div
                                        key={skill.id}
                                        className="flex items-center gap-2"
                                    >
                                        <Label className="flex-1">
                                            {skill.name}
                                        </Label>
                                        <Input
                                            type="number"
                                            min={0}
                                            className="w-20 border-input flex h-9 min-w-0 rounded-md border px-3 py-1 bg-input-background outline-none"
                                            value={requirements[skill.id] ?? 0}
                                            onChange={(e) =>
                                                setRequirements({
                                                    ...requirements,
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
                </div>

                {/* Buttons */}
                <div className="flex gap-2 mt-4">
                    <Button
                        onClick={handleSubmit}
                        className="flex-1"
                        disabled={loading}
                    >
                        {loading ? "Creating..." : "Create Shift"}
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

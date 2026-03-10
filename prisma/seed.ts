import { PrismaPg } from "@prisma/adapter-pg";
import {
    PrismaClient,
    Role,
    ShiftStatus,
    SwapStatus,
    ExceptionType,
    User,
    Shift,
} from "../generated/prisma/client";
import bcrypt from "bcryptjs";

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log("🌱 Seeding database...");

    const password = await bcrypt.hash("password123", 10);

    /*
  =====================================================
  SKILLS
  =====================================================
  */
    const bartender = await prisma.skill.create({
        data: { name: "Bartender" },
    });
    const server = await prisma.skill.create({ data: { name: "Server" } });
    const lineCook = await prisma.skill.create({ data: { name: "Line Cook" } });
    const host = await prisma.skill.create({ data: { name: "Host" } });

    /*
  =====================================================
  LOCATIONS
  =====================================================
  */
    const santaMonica = await prisma.location.create({
        data: { name: "Santa Monica Pier", timezone: "America/Los_Angeles" },
    });
    const sanDiego = await prisma.location.create({
        data: { name: "San Diego Harbor", timezone: "America/Los_Angeles" },
    });
    const miami = await prisma.location.create({
        data: { name: "Miami Beach", timezone: "America/New_York" },
    });
    const charleston = await prisma.location.create({
        data: { name: "Charleston Waterfront", timezone: "America/New_York" },
    });

    /*
  =====================================================
  USERS: ADMIN & MANAGERS
  =====================================================
  */
    const admin = await prisma.user.create({
        data: {
            email: "admin@coastaleats.com",
            password,
            role: Role.ADMIN,
            firstName: "Corporate",
            lastName: "Admin",
            desiredHours: 40,
        },
    });

    const managerLA = await prisma.user.create({
        data: {
            email: "manager.la@coastaleats.com",
            password,
            role: Role.MANAGER,
            firstName: "Sarah",
            lastName: "Chen",
            managedLocations: { connect: [{ id: santaMonica.id }] },
        },
    });

    const managerSD = await prisma.user.create({
        data: {
            email: "manager.sd@coastaleats.com",
            password,
            role: Role.MANAGER,
            firstName: "Carlos",
            lastName: "Ramirez",
            managedLocations: { connect: [{ id: sanDiego.id }] },
        },
    });

    const managerMiami = await prisma.user.create({
        data: {
            email: "manager.miami@coastaleats.com",
            password,
            role: Role.MANAGER,
            firstName: "Danielle",
            lastName: "Brooks",
            managedLocations: { connect: [{ id: miami.id }] },
        },
    });

    const managerCharleston = await prisma.user.create({
        data: {
            email: "manager.charleston@coastaleats.com",
            password,
            role: Role.MANAGER,
            firstName: "Michael",
            lastName: "Turner",
            managedLocations: { connect: [{ id: charleston.id }] },
        },
    });

    /*
  =====================================================
  STAFF
  =====================================================
  */
    const staffNames = [
        ["Emma", "Lopez"],
        ["James", "Wong"],
        ["Olivia", "Patel"],
        ["Liam", "Garcia"],
        ["Noah", "Kim"],
        ["Ava", "Nguyen"],
        ["Sophia", "Brown"],
        ["Lucas", "Martinez"],
        ["Mia", "Wilson"],
        ["Ethan", "Anderson"],
        ["Isabella", "Thomas"],
        ["Mason", "White"],
        ["Charlotte", "Harris"],
        ["Logan", "Clark"],
        ["Amelia", "Lewis"],
        ["Elijah", "Young"],
        ["Harper", "Scott"],
        ["Benjamin", "Hall"],
        ["Aria", "King"],
        ["Jackson", "Lee"],
    ];

    const staff: User[] = [];
    for (let i = 0; i < staffNames.length; i++) {
        const user = await prisma.user.create({
            data: {
                email: `staff${i + 1}@coastaleats.com`,
                password,
                role: Role.STAFF,
                firstName: staffNames[i][0],
                lastName: staffNames[i][1],
                desiredHours: [20, 25, 30, 35][i % 4],
            },
        });
        staff.push(user);
    }

    /*
  =====================================================
  CERTIFICATIONS
  =====================================================
  */
    for (let i = 0; i < staff.length; i++) {
        const location = [santaMonica, sanDiego, miami, charleston][i % 4];
        const skill = [bartender, server, lineCook, host][i % 4];
        await prisma.certification.create({
            data: {
                userId: staff[i].id,
                locationId: location.id,
                skills: { connect: [{ id: skill.id }] },
            },
        });
    }
    // Cross-location certification for edge cases
    await prisma.certification.create({
        data: {
            userId: staff[0].id,
            locationId: miami.id,
            skills: { connect: [{ id: bartender.id }] },
        },
    });

    /*
  =====================================================
  AVAILABILITY & EXCEPTIONS
  =====================================================
  */
    for (const user of staff) {
        for (let day = 1; day <= 7; day++) {
            await prisma.availability.create({
                data: {
                    userId: user.id,
                    dayOfWeek: day,
                    startHour: 9,
                    endHour: 17,
                },
            });
        }
    }
    await prisma.availabilityException.create({
        data: {
            userId: staff[1].id,
            date: new Date("2026-03-15"),
            type: ExceptionType.UNAVAILABLE,
        },
    });
    await prisma.availabilityException.create({
        data: {
            userId: staff[2].id,
            date: new Date("2026-03-16"),
            type: ExceptionType.AVAILABLE,
        },
    });

    /*
  =====================================================
  SHIFTS
  =====================================================
  */
    const weekStart = new Date("2026-03-15");
    const locations = [santaMonica, sanDiego, miami, charleston];
    const shifts: Shift[] = [];

    // Standard + premium shifts
    for (const loc of locations) {
        for (let i = 0; i < 7; i++) {
            const date = new Date(weekStart);
            date.setDate(date.getDate() + i);
            const shift = await prisma.shift.create({
                data: {
                    locationId: loc.id,
                    date,
                    startTime: new Date(date.setHours(17)),
                    endTime: new Date(date.setHours(23)),
                    status: ShiftStatus.PUBLISHED,
                    isPremium: i >= 4,
                },
            });
            shifts.push(shift);
            // All 4 skills required
            await prisma.shiftRequirement.create({
                data: { shiftId: shift.id, skillId: server.id, quantity: 2 },
            });
            await prisma.shiftRequirement.create({
                data: { shiftId: shift.id, skillId: bartender.id, quantity: 1 },
            });
            await prisma.shiftRequirement.create({
                data: { shiftId: shift.id, skillId: lineCook.id, quantity: 2 },
            });
            await prisma.shiftRequirement.create({
                data: { shiftId: shift.id, skillId: host.id, quantity: 1 },
            });
        }
    }

    // Overnight & DST shifts
    await prisma.shift.create({
        data: {
            locationId: miami.id,
            date: new Date("2026-03-18"),
            startTime: new Date("2026-03-18T23:00:00Z"),
            endTime: new Date("2026-03-19T03:00:00Z"),
            status: ShiftStatus.PUBLISHED,
        },
    });
    await prisma.shift.create({
        data: {
            locationId: charleston.id,
            date: new Date("2026-03-14"),
            startTime: new Date("2026-03-14T01:30:00-05:00"),
            endTime: new Date("2026-03-14T03:30:00-05:00"),
            status: ShiftStatus.PUBLISHED,
        },
    });

    /*
  =====================================================
  ASSIGNMENTS
  =====================================================
  */
    for (let i = 0; i < shifts.length; i++) {
        await prisma.shiftAssignment.create({
            data: { shiftId: shifts[i].id, userId: staff[i % 6].id },
        });
    }

    // Overtime & labor law edge cases
    for (let i = 0; i < 6; i++) {
        const shift = await prisma.shift.create({
            data: {
                locationId: miami.id,
                date: new Date(2026, 2, 10 + i),
                startTime: new Date(2026, 2, 10 + i, 10),
                endTime: new Date(2026, 2, 10 + i, 20),
                status: ShiftStatus.PUBLISHED,
            },
        });
        await prisma.shiftAssignment.create({
            data: { shiftId: shift.id, userId: staff[2].id },
        });
    }

    // 7th consecutive day
    const consecutiveShift = await prisma.shift.create({
        data: {
            locationId: sanDiego.id,
            date: new Date("2026-03-22"),
            startTime: new Date("2026-03-22T09:00:00Z"),
            endTime: new Date("2026-03-22T17:00:00Z"),
            status: ShiftStatus.PUBLISHED,
        },
    });
    await prisma.shiftAssignment.create({
        data: { shiftId: consecutiveShift.id, userId: staff[2].id },
    });

    // 10-hour rest violation
    const lateShift = await prisma.shift.create({
        data: {
            locationId: sanDiego.id,
            date: new Date("2026-03-20"),
            startTime: new Date("2026-03-20T22:00:00Z"),
            endTime: new Date("2026-03-21T02:00:00Z"),
            status: ShiftStatus.PUBLISHED,
        },
    });
    const earlyShift = await prisma.shift.create({
        data: {
            locationId: sanDiego.id,
            date: new Date("2026-03-21"),
            startTime: new Date("2026-03-21T08:00:00Z"),
            endTime: new Date("2026-03-21T14:00:00Z"),
            status: ShiftStatus.PUBLISHED,
        },
    });
    await prisma.shiftAssignment.create({
        data: { shiftId: lateShift.id, userId: staff[3].id },
    });

    /*
  =====================================================
  SWAP & DROP REQUESTS
  =====================================================
  */
    const swap1 = await prisma.swapRequest.create({
        data: {
            shiftId: shifts[0].id,
            fromUserId: staff[0].id,
            toUserId: staff[4].id,
            status: SwapStatus.PENDING,
        },
    });
    const swap2 = await prisma.swapRequest.create({
        data: {
            shiftId: shifts[1].id,
            fromUserId: staff[0].id,
            toUserId: staff[5].id,
            status: SwapStatus.PENDING,
        },
    });
    const swap3 = await prisma.swapRequest.create({
        data: {
            shiftId: shifts[2].id,
            fromUserId: staff[0].id,
            toUserId: staff[6].id,
            status: SwapStatus.PENDING,
        },
    });
    // Swap regret
    await prisma.swapRequest.update({
        where: { id: swap1.id },
        data: { status: SwapStatus.CANCELLED },
    });

    await prisma.swapRequest.create({
        data: {
            shiftId: shifts[3].id,
            fromUserId: staff[1].id,
            toUserId: staff[7].id,
            status: SwapStatus.APPROVED,
            approvedById: managerLA.id,
            approvedAt: new Date(),
        },
    });
    await prisma.swapRequest.create({
        data: {
            shiftId: shifts[4].id,
            fromUserId: staff[2].id,
            toUserId: staff[8].id,
            status: SwapStatus.REJECTED,
            approvedById: managerSD.id,
            approvedAt: new Date(),
        },
    });

    await prisma.dropRequest.create({
        data: {
            shiftId: shifts[5].id,
            userId: staff[5].id,
            expiresAt: new Date("2026-03-18T00:00:00Z"),
            status: SwapStatus.PENDING,
        },
    });

    /*
  =====================================================
  NOTIFICATIONS
  =====================================================
  */
    for (const user of staff) {
        await prisma.notification.create({
            data: {
                userId: user.id,
                message: "New schedule published for next week.",
            },
        });
        await prisma.notification.create({
            data: {
                userId: user.id,
                message: "Swap request pending approval.",
            },
        });
    }
    await prisma.notification.create({
        data: {
            userId: managerLA.id,
            message: "Swap request awaiting approval.",
        },
    });
    await prisma.notification.create({
        data: {
            userId: managerSD.id,
            message: "Overtime warning: staff[2] approaching 40h/week.",
        },
    });

    /*
  =====================================================
  AUDIT LOGS
  =====================================================
  */
    await prisma.auditLog.create({
        data: {
            entityType: "Shift",
            entityId: shifts[0].id,
            action: "CREATE",
            after: { createdBy: managerLA.id },
            performedById: managerLA.id,
        },
    });
    await prisma.auditLog.create({
        data: {
            entityType: "Shift",
            entityId: lateShift.id,
            action: "ASSIGN",
            after: { assignedTo: staff[3].id },
            performedById: managerSD.id,
        },
    });
    await prisma.auditLog.create({
        data: {
            entityType: "SwapRequest",
            entityId: swap1.id,
            action: "CANCEL",
            after: { fromUser: staff[0].id, toUser: staff[4].id },
            performedById: staff[0].id,
        },
    });

    console.log("✅ Seed completed with full coverage including edge cases");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

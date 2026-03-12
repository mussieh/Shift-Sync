import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Unauthorized Page",
};

const UnauthorizedPage = async () => {
    return (
        <main className="bg-white w-screen h-screen flex justify-center items-center p-8">
            <section className="space-y-8">
                <Image
                    src="/images/unauthorized.jpg"
                    alt="Red No entry icon"
                    width={400}
                    height={400}
                    priority
                />
                <div className="text-center text-[2rem] font-bold text-[#3B83F6]">
                    <Link href="/dashboard">Go to Dashboard Page</Link>
                </div>
            </section>
        </main>
    );
};

export default UnauthorizedPage;

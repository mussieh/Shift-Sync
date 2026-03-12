import Image from "next/image";
import Link from "next/link";

const NotFound = () => {
    return (
        <main className="bg-white w-screen h-screen flex justify-center items-center">
            <section>
                <Image
                    src="/images/not-found.jpg"
                    alt="Socket disconnected illustration"
                    width={800}
                    height={400}
                    priority
                />
                <div className="text-center text-2xl text-blue-500">
                    <Link href="/">Return Home</Link>
                </div>
            </section>
        </main>
    );
};

export default NotFound;

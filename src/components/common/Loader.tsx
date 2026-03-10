import { GridLoader } from "react-spinners";

const Loader = () => {
    return (
        <div className="w-screen h-screen flex justify-center items-center">
            <GridLoader color="#0E172B" />
        </div>
    );
};

export default Loader;

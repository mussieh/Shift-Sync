import { GridLoader } from "react-spinners";

const Loading = () => {
    return (
        <div className="w-full h-full flex justify-center items-center">
            <GridLoader color="#0E172B" />
        </div>
    );
};

export default Loading;

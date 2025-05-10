import { Box } from "@chakra-ui/react";
import { TfiClose } from "react-icons/tfi";
import { RiLockLine } from "react-icons/ri";
import { FcGoogle } from "react-icons/fc";
import { FaApple } from "react-icons/fa";
import { FaFacebook } from "react-icons/fa";
import Input from "./Input";
import Button from "./Button";
import CheckBox from "./CheckBox";
import { useState } from "react";
import { login as loginFn, singUp } from "../_lib/data-service";
import { toast } from "sonner";
// import { useQueryClient } from "@tanstack/react-query";
import SpinnerMini from "./SpinnerMini";
import { useAuth } from "../_contexts/AuthProvider";
import { validatePassword } from "../_utils/utils";
import { validateEmail } from "../_utils/utils";

type FormError = {
  email?: string | null;
  password?: string | null;
};

export default function AuthModal({ onClose }: { onClose?: () => void }) {
  const [hasAccount, setHasAccount] = useState(true);

  const { authenticated, logout } = useAuth();

  const handleHasAccount = () => {
    setHasAccount(!hasAccount);
  };

  // useEffect(() => {
  //   setErrors({ email: "", password: "" });
  // }, [hasAccount]);

  // const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
  //   e.preventDefault();
  //   const formData = new FormData(e.currentTarget);
  //   const email = formData.get("email") as string;
  //   const password = formData.get("password") as string;

  //   const emailError = validateEmail(email as string);
  //   const passwordError = validatePassword(password as string);
  //   setErrors({ email: emailError, password: passwordError });
  //   if (emailError || passwordError) return;

  //   try {
  //     setIsLoading(true);
  //     if (hasAccount) {
  //       const { user, token } = await loginFn({ email, password });

  //       toast.success("Signed in successfully");
  //       login(user, token);
  //       onClose?.();
  //     } else {
  //       const { user, token } = await singUp({ email, password });

  //       toast.success("Signed up successfully");
  //       login(user, token);
  //       // invalidate all queries
  //       queryClient.invalidateQueries({});
  //       queryClient.invalidateQueries({ queryKey: ["userCartSummary"] });
  //       onClose?.();
  //     }
  //   } catch (err) {
  //     console.error(err);
  //     if (err instanceof Error) {
  //       toast.error(err.message);
  //     }
  //   } finally {
  //     setIsLoading(false);
  //   }
  // };

  return (
    <Box className="bg-white p-[3.2rem] w-[43rem] h-screen ">
      <Box className="flex justify-between items-center mb-[2.2rem]">
        <h2 className="text-black text-[2rem] font-medium">Sign In</h2>

        <TfiClose
          className="text-[#000] cursor-pointer text-[2rem]"
          onClick={onClose}
        />
      </Box>

      {authenticated ? (
        <div className="text-black text-[2rem] font-medium">
          <button onClick={logout}>Logout</button>
        </div>
      ) : hasAccount ? (
        <SignIn onClose={onClose} handleHasAccount={handleHasAccount} />
      ) : (
        <SignUp onClose={onClose} handleHasAccount={handleHasAccount} />
      )}
    </Box>
  );
}

function SignIn({
  onClose,
  handleHasAccount,
}: {
  onClose?: () => void;
  handleHasAccount?: () => void;
}) {
  const [errors, setErrors] = useState<FormError>({
    email: "",
    password: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const emailError = validateEmail(email as string);
    const passwordError = validatePassword(password as string, {
      signUp: false,
    });
    setErrors({ email: emailError, password: passwordError });
    if (emailError || passwordError) return;

    console.log(email, password);
    try {
      setIsLoading(true);
      const { user, token } = await loginFn({ email, password });
      toast.success("Signed in successfully");
      login(user, token);
      onClose?.();
    } catch (err) {
      console.error(err);
      if (err instanceof Error) {
        toast.error(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <Box>
      <form onSubmit={handleSubmit} className="flex flex-col mb-[1.5rem]">
        <Box className="mb-[1.5rem]">
          <Input
            name="email"
            type="email"
            id="my-email"
            placeholder="Email*"
            focusOnMount={true}
            error={errors.email}
            onChange={(e) => {
              const emailError = validateEmail(e.target.value);
              if (emailError) {
                setErrors((prevErrors) => {
                  return { ...prevErrors, email: emailError };
                });
              } else {
                setErrors((prevErrors) => {
                  return { ...prevErrors, email: null };
                });
              }
            }}
          />
        </Box>

        <Input
          name="password"
          type="password"
          id="my-password"
          placeholder="Password*"
          error={errors.password}
          onChange={(e) => {
            const passwordError = validatePassword(e.target.value);
            if (passwordError) {
              setErrors((prevErrors) => {
                return { ...prevErrors, password: passwordError };
              });
            } else {
              setErrors((prevErrors) => {
                return { ...prevErrors, password: null };
              });
            }
          }}
        />

        <Box className="flex justify-between text-[#000] text-[1.4rem] mt-[2rem]">
          <Box className="flex items-center gap-[.8rem]">
            <CheckBox name="remember-password" id="my-remember-password" />

            <label htmlFor="my-remember-password">Remember me</label>
          </Box>

          <Button
            className="text-[1.4rem] text-[#000]"
            onClick={() => {}}
            type="link"
          >
            Forgot your password?
          </Button>
        </Box>

        <Button
          action="submit"
          type="primary"
          disabled={isLoading}
          className={`mt-[2.4rem] hover:bg-transparent text-white hover:text-[#000] border-[.1px] border-[#000] ${
            isLoading ? "bg-transparent" : "bg-black"
          }`}
        >
          <div className="flex items-center justify-center gap-[1rem]">
            {isLoading ? (
              <SpinnerMini className="border-black" />
            ) : (
              <>
                <RiLockLine className="text-[2.2rem]" />
                <span className="font-medium">Sign In</span>
              </>
            )}
          </div>
        </Button>
      </form>

      <p className="text-[#000] text-[1.4rem] text-center py-[2rem]">
        Or continue with
      </p>

      <Box className="flex items-center justify-center gap-[1rem] ">
        <Button
          type="icon"
          className="hover:bg-black group  flex items-center justify-center transition-all duration-300"
        >
          <FcGoogle className="text-[2rem] group-hover:text-white" />
        </Button>

        <Button
          type="icon"
          className="hover:bg-black group  flex items-center justify-center transition-all duration-300"
        >
          <FaApple className="text-[2rem] text-black group-hover:text-white" />
        </Button>

        <Button
          type="icon"
          className="group hover:bg-black flex items-center justify-center transition-all duration-300"
        >
          <FaFacebook className="text-[2rem] text-blue-600 group-hover:text-white" />
        </Button>
      </Box>

      <hr className="border-[0.0625rem] border-[#e4e4e4] my-[2rem]" />

      <Box className="">
        <h2 className="text-black text-[2rem] font-medium mb-[2.4rem]">
          New Customer
        </h2>

        <Button
          type="outline"
          disabled={isLoading}
          onClick={handleHasAccount}
          className="w-full"
        >
          Register
        </Button>
      </Box>
    </Box>
  );
}

function SignUp({
  onClose,
  handleHasAccount,
}: {
  onClose?: () => void;
  handleHasAccount?: () => void;
}) {
  const [errors, setErrors] = useState<FormError>({
    email: "",
    password: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const emailError = validateEmail(email as string);
    const passwordError = validatePassword(password as string, {
      signUp: true,
    });
    setErrors({ email: emailError, password: passwordError });
    if (emailError || passwordError) return;

    try {
      setIsLoading(true);
      const { user, token } = await singUp({ email, password });
      toast.success("Signed up successfully");
      login(user, token);
      onClose?.();
    } catch (err) {
      console.error(err);
      if (err instanceof Error) {
        toast.error(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <Box>
      <Button type="outline" onClick={handleHasAccount} className="w-full ">
        Sign In
      </Button>

      <hr className="border-[0.0625rem] border-[#e4e4e4] my-[2rem]" />

      <h2 className="text-black text-[2rem] font-medium mb-[2.4rem]">
        New Customer
      </h2>

      <form onSubmit={handleSubmit}>
        <Box className="mb-[1.5rem]">
          <Input
            name="email"
            type="email"
            id="my-email"
            placeholder="Email*"
            focusOnMount={true}
            error={errors.email}
            onChange={(e) => {
              const emailError = validateEmail(e.target.value);
              if (emailError) {
                setErrors((prevErrors) => {
                  return { ...prevErrors, email: emailError };
                });
              } else {
                setErrors((prevErrors) => {
                  return { ...prevErrors, email: null };
                });
              }
            }}
          />
        </Box>

        <Input
          name="password"
          type="password"
          id="my-password"
          placeholder="Password*"
          error={errors.password}
          onChange={(e) => {
            const passwordError = validatePassword(e.target.value);
            if (passwordError) {
              setErrors((prevErrors) => {
                return { ...prevErrors, password: passwordError };
              });
            } else {
              setErrors((prevErrors) => {
                return { ...prevErrors, password: null };
              });
            }
          }}
        />

        <Box className="flex items-start gap-[.8rem] mt-[1.5rem]">
          <CheckBox id="my-terms" name="terms" />
          <label htmlFor="my-terms" className="text-[1.4rem] text-[#000]">
            I confirm that I have read and accepted the{" "}
            <span className="underline">terms and conditions</span> of the
            online store including its{" "}
            <span className="underline">privacy notice</span>.
          </label>
        </Box>

        <Button
          className={`w-full mt-[2.8rem] text-white mb-[1.6rem] flex items-center justify-center hover:bg-transparent hover:text-[#000] border-[.1px] border-[#000] ${
            isLoading ? "bg-transparent" : "bg-black"
          }`}
          type="primary"
          action="submit"
        >
          {isLoading ? <SpinnerMini className="border-black" /> : "Register"}
        </Button>
      </form>

      <p className="text-[#000] text-[1.4rem] text-center py-[2rem]">
        Or continue with
      </p>

      <Box className="flex items-center justify-center gap-[1rem] ">
        <Button
          type="icon"
          className="hover:bg-black group transition-all duration-300"
        >
          <FcGoogle className="text-[2rem] group-hover:text-white" />
        </Button>

        <Button
          onClick={() => {}}
          type="icon"
          className="hover:bg-black group transition-all duration-300"
        >
          <FaApple className="text-[2rem] text-black group-hover:text-white" />
        </Button>

        <Button
          onClick={() => {}}
          type="icon"
          className="group hover:bg-black transition-all duration-300"
        >
          <FaFacebook className="text-[2rem] text-blue-600 group-hover:text-white" />
        </Button>
      </Box>
    </Box>
  );
}

import { useEffect } from "react";

/**
 * Jotform Feedback Widget Component
 * Adds a beta tester feedback button to the application
 */
export function FeedbackWidget() {
  useEffect(() => {
    // Load Jotform feedback scripts
    const loadScript = (src: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        // Check if script already exists
        const existingScript = document.querySelector(`script[src="${src}"]`);
        if (existingScript) {
          resolve();
          return;
        }

        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
        document.head.appendChild(script);
      });
    };

    const initializeWidget = async () => {
      try {
        // Load the feedback script
        await loadScript("https://cdn.jotfor.ms/s/static/latest/static/feedback2.js");

        // Wait a bit for the script to initialize
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Initialize the feedback component
        if (typeof (window as any).JotformFeedback !== "undefined") {
          const componentID = new (window as any).JotformFeedback({
            type: false,
            width: 700,
            height: 500,
            fontColor: "#FFFFFF",
            background: "#F59202",
            isCardForm: false,
            formId: "253436220228046",
            buttonText: "Feedback",
            buttonSide: "left",
            buttonAlign: "center",
            base: "https://form.jotform.com/",
          }).componentID;

          // Load the embed handler
          await loadScript("https://cdn.jotfor.ms/s/umd/latest/for-form-embed-handler.js");

          // Wait for embed handler to be available
          await new Promise((resolve) => setTimeout(resolve, 100));

          // Initialize embed handler
          if (typeof (window as any).jotformEmbedHandler !== "undefined") {
            (window as any).jotformEmbedHandler(
              `iframe[id='${componentID}_iframe']`,
              "https://form.jotform.com/"
            );
          }
        }
      } catch (error) {
        console.error("Failed to initialize feedback widget:", error);
      }
    };

    initializeWidget();

    // Cleanup function (optional - scripts can remain loaded)
    return () => {
      // Scripts are left in the DOM for performance
      // They can be removed if needed, but it's not necessary
    };
  }, []);

  // This component doesn't render anything - it just loads scripts
  return null;
}


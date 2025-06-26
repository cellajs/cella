export declare const uploadTemplates: {
    avatar: {
        steps: {
            converted: {
                use: string;
                robot: string;
                format: string;
            };
            thumbnail: {
                use: string;
                robot: string;
                resize_strategy: string;
                width: number;
                height: number;
            };
        };
        use: readonly ["thumbnail"];
    };
    cover: {
        steps: {
            converted: {
                use: string;
                robot: string;
                format: string;
            };
            cover: {
                use: string;
                robot: string;
                resize_strategy: string;
                width: number;
                height: number;
            };
        };
        use: readonly ["cover"];
    };
    attachment: {
        steps: {
            filter_images: {
                use: string;
                robot: string;
                accepts: string[][];
            };
            filter_documents: {
                use: string;
                robot: string;
                accepts: string[][];
                declines: string[][];
            };
            filter_audio: {
                use: string;
                robot: string;
                accepts: string[][];
            };
            filter_pdf: {
                use: string;
                robot: string;
                accepts: string[][];
            };
            converted_image: {
                use: string;
                robot: string;
                resize_strategy: string;
                width: number;
                height: number;
                format: string;
            };
            converted_audio: {
                use: string;
                robot: string;
                preset: string;
            };
            converted_document: {
                use: string;
                robot: string;
                format: string;
                accepted: string[];
            };
            thumb_pdf: {
                use: string;
                robot: string;
                count: number;
                page: number;
                format: string;
                width: number;
                height: number;
            };
            thumb_document: {
                use: string;
                robot: string;
                count: number;
                page: number;
                format: string;
                width: number;
                height: number;
            };
            thumb_video: {
                use: string;
                robot: string;
                count: number;
                format: string;
                width: number;
                height: number;
            };
            thumb_image: {
                use: string;
                robot: string;
                count: number;
                format: string;
                width: number;
                height: number;
            };
        };
        use: readonly [":original", "thumb_image", "thumb_video", "thumb_pdf", "thumb_document", "converted_image", "converted_audio", "converted_document"];
    };
};
//# sourceMappingURL=templates.d.ts.map
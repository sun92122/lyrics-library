import {
  type ProOptions,
  type ProFormat,
  getProFormat,
  getProFile,
} from "@/utils/propresenterFormatter";
import {
  Checkbox,
  Field,
  Label,
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from "@headlessui/react";
import { ChevronDown } from "lucide-react";
import { CheckIcon } from "@heroicons/react/16/solid";
import { useState } from "react";

interface LyricsModalOptionsProps {
  options: ProOptions;
  setOptions: React.Dispatch<React.SetStateAction<ProOptions>>;
}
// // default is all true --> checkbox for each option, if unchecked, set to false
// includeCurrentArrangement?: boolean;
// includeDefaultArrangement?: boolean;
// includeTitleSlide?: boolean;
// addBlankSlideBeforeTitle?: boolean;
// includeLanguage2?: boolean;
// flowMapping?: string; // name of flow mapping, default is "Magical"

// // template for export, if not provided, use default template
// template?: {
//   language1?: slideElementOptions;
//   language2?: slideElementOptions;
//   title1?: slideElementOptions;
//   title2?: slideElementOptions;
//   title3?: slideElementOptions;
// };

export const LyricsModalOptions: React.FC<LyricsModalOptionsProps> = ({
  options,
  setOptions,
}) => {
  const checkboxClassName =
    "group mt-1 size-6 rounded-md bg-black/5 p-1 ring-1 ring-black/15 ring-inset focus:not-data-[focus]:outline-none data-[checked]:bg-black data-[focus]:outline data-[focus]:outline-offset-0 data-[focus]:outline-black/50";
  const handleOptionChange = (optionKey: keyof ProOptions, value: any) => {
    setOptions((prevOptions) => ({
      ...prevOptions,
      [optionKey]: value,
    }));
  };

  return (
    <div className="flex flex-col gap-3 pl-8 pb-4">
      <Field className="flex items-start gap-2 cursor-pointer">
        <Checkbox
          checked={options.includeCurrentArrangement ?? true}
          onChange={(value) => {
            handleOptionChange("includeCurrentArrangement", value);
          }}
          className={checkboxClassName}
        >
          <CheckIcon className="hidden size-4 fill-white group-data-[checked]:block" />
        </Checkbox>
        <Label>
          包含當前編曲<span className="text-xs text-gray-400">（如果有）</span>
          <span className="block text-gray-400 text-sm/3 ml-0.5 whitespace-wrap">
            Include the current arrangement.
          </span>
        </Label>
      </Field>
      <Field className="flex items-start gap-2 cursor-pointer">
        <Checkbox
          checked={options.includeDefaultArrangement ?? true}
          onChange={(value) =>
            handleOptionChange("includeDefaultArrangement", value)
          }
          className={checkboxClassName}
        >
          <CheckIcon className="hidden size-4 fill-white group-data-[checked]:block" />
        </Checkbox>
        {/* <Label>Include Default Arrangement</Label> */}
        <Label>
          包含預設編曲<span className="text-xs text-gray-400">（如果有）</span>
          <span className="block text-gray-400 text-sm/3 ml-0.5 whitespace-wrap">
            Include the default arrangement.
          </span>
        </Label>
      </Field>
      <Field className="flex items-start gap-2 cursor-pointer">
        <Checkbox
          checked={options.includeTitleSlide ?? true}
          onChange={(value) => handleOptionChange("includeTitleSlide", value)}
          className={checkboxClassName}
        >
          <CheckIcon className="hidden size-4 fill-white group-data-[checked]:block" />
        </Checkbox>
        <Label>
          包含標題投影片
          <span className="block text-gray-400 text-sm/3 ml-0.5 whitespace-wrap">
            Include the title slide.
          </span>
        </Label>
      </Field>
      <Field className="flex items-start gap-2 cursor-pointer">
        <Checkbox
          checked={options.includeLanguage2 ?? true}
          onChange={(value) => handleOptionChange("includeLanguage2", value)}
          className={checkboxClassName}
        >
          <CheckIcon className="hidden size-4 fill-white group-data-[checked]:block" />
        </Checkbox>
        <Label>
          包含次要語言<span className="text-xs text-gray-400">（如果有）</span>
          <span className="block text-gray-400 text-sm/3 ml-0.5 whitespace-wrap">
            Include Language 2.
          </span>
        </Label>
      </Field>
      <Field className="flex items-start gap-2 cursor-pointer">
        <Checkbox
          checked={options.twoLinesPerSlide ?? false}
          onChange={(value) => handleOptionChange("twoLinesPerSlide", value)}
          className={checkboxClassName}
        >
          <CheckIcon className="hidden size-4 fill-white group-data-[checked]:block" />
        </Checkbox>
        <Label>
          每張投影片兩行歌詞
          <span className="text-xs text-red-500/50">（實驗中，需搭配合適的主題）</span>
          <span className="block text-gray-400 text-sm/3 ml-0.5 whitespace-wrap">
            Two lines of lyrics per slide.
          </span>
        </Label>
      </Field>
      <Field className="flex items-start gap-2 cursor-pointer">
        <Checkbox
          checked={options.includeAuthor ?? true}
          onChange={(value) => handleOptionChange("includeAuthor", value)}
          className={checkboxClassName}
        >
          <CheckIcon className="hidden size-4 fill-white group-data-[checked]:block" />
        </Checkbox>
        <Label>
          在標題投影片包含作者
          <span className="block text-gray-400 text-sm/3 ml-0.5 whitespace-wrap">
            Include Author. （預設顯示在投影片外）
          </span>
        </Label>
      </Field>
      <Disclosure>
        <DisclosureButton className="p-2 group flex items-center gap-2 cursor-pointer">
          <p>添加空白幻燈片的選項</p>
          <ChevronDown className="w-4 h-4 text-gray-400 group-data-[open]:rotate-180" />
        </DisclosureButton>
        <DisclosurePanel>
          <div className="flex flex-col gap-3 pl-4">
            <Field className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={options.addBlankSlideBeforeTitle ?? true}
                onChange={(value) =>
                  handleOptionChange("addBlankSlideBeforeTitle", value)
                }
                className={checkboxClassName}
              >
                <CheckIcon className="hidden size-4 fill-white group-data-[checked]:block" />
              </Checkbox>
              <Label>
                在標題前添加空白幻燈片
                <span className="block text-gray-400 text-sm/3 ml-0.5 whitespace-wrap">
                  Add a blank slide before the title.
                </span>
              </Label>
            </Field>
            <Field className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={options.addBlankSlideAfterTitle ?? true}
                onChange={(value) =>
                  handleOptionChange("addBlankSlideAfterTitle", value)
                }
                className={checkboxClassName}
              >
                <CheckIcon className="hidden size-4 fill-white group-data-[checked]:block" />
              </Checkbox>
              <Label>
                在標題後添加空白幻燈片
                <span className="block text-gray-400 text-sm/3 ml-0.5 whitespace-wrap">
                  Add a blank slide after the title.
                </span>
              </Label>
            </Field>
            <Field className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={options.addBlankSlideAfterEnding ?? true}
                onChange={(value) =>
                  handleOptionChange("addBlankSlideAfterEnding", value)
                }
                className={checkboxClassName}
              >
                <CheckIcon className="hidden size-4 fill-white group-data-[checked]:block" />
              </Checkbox>
              <Label>
                在結尾後添加空白幻燈片
                <span className="block text-gray-400 text-sm/3 ml-0.5 whitespace-wrap">
                  Add a blank slide after the ending.
                </span>
              </Label>
            </Field>
            <Field className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={options.addBlankSlideDuringIntro ?? false}
                onChange={(value) =>
                  handleOptionChange("addBlankSlideDuringIntro", value)
                }
                className={checkboxClassName}
              >
                <CheckIcon className="hidden size-4 fill-white group-data-[checked]:block" />
              </Checkbox>
              <Label>
                在前奏添加空白幻燈片
                <span className="block text-gray-400 text-sm/3 ml-0.5 whitespace-wrap">
                  Add a blank slide during the intro.
                </span>
              </Label>
            </Field>
            <Field className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={options.addBlankSlideDuringInterlude ?? true}
                onChange={(value) =>
                  handleOptionChange("addBlankSlideDuringInterlude", value)
                }
                className={checkboxClassName}
              >
                <CheckIcon className="hidden size-4 fill-white group-data-[checked]:block" />
              </Checkbox>
              <Label>
                在間奏添加空白幻燈片
                <span className="block text-gray-400 text-sm/3 ml-0.5 whitespace-wrap">
                  Add a blank slide during the interlude.
                </span>
              </Label>
            </Field>
            <Field className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={options.addBlankSlideDuringWorship ?? true}
                onChange={(value) =>
                  handleOptionChange("addBlankSlideDuringWorship", value)
                }
                className={checkboxClassName}
              >
                <CheckIcon className="hidden size-4 fill-white group-data-[checked]:block" />
              </Checkbox>
              <Label>
                在自由敬拜添加空白幻燈片
                <span className="block text-gray-400 text-sm/3 ml-0.5 whitespace-wrap">
                  Add a blank slide during the worship.
                </span>
              </Label>
            </Field>
            <Field className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={options.addBlankSlideDuringPrayer ?? true}
                onChange={(value) =>
                  handleOptionChange("addBlankSlideDuringPrayer", value)
                }
                className={checkboxClassName}
              >
                <CheckIcon className="hidden size-4 fill-white group-data-[checked]:block" />
              </Checkbox>
              <Label>
                在禱告添加空白幻燈片
                <span className="block text-gray-400 text-sm/3 ml-0.5 whitespace-wrap">
                  Add a blank slide during the prayer.
                </span>
              </Label>
            </Field>
          </div>
        </DisclosurePanel>
      </Disclosure>
    </div>
  );
};

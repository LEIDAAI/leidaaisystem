import { ElMessageBox } from 'element-plus'

/** 确认弹窗：确定返回 true，取消返回 false */
export async function confirmAction(message: string, title = '提示'): Promise<boolean> {
  try {
    await ElMessageBox.confirm(message, title, {
      type: 'warning',
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    })
    return true
  } catch {
    return false
  }
}

interface PromptOptions {
  inputType?: string
  inputPattern?: RegExp
  inputErrorMessage?: string
  inputValue?: string
  placeholder?: string
}

/** 输入弹窗：确定返回输入值，取消返回 null */
export async function promptText(message: string, title: string, options?: PromptOptions): Promise<string | null> {
  try {
    const { value } = await ElMessageBox.prompt(message, title, {
      inputType: options?.inputType ?? 'text',
      inputPattern: options?.inputPattern,
      inputErrorMessage: options?.inputErrorMessage,
      inputValue: options?.inputValue,
      inputPlaceholder: options?.placeholder,
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    })
    return value
  } catch {
    return null
  }
}

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type -Path "C:\Users\openw\Documents\Projects\visual-directory\evidence\native-r121\r151-native-fixtures\MouseNative.cs"
$target='C:\Users\openw\Documents\Projects\visual-directory\evidence\native-r121\r151-native-fixtures\selection-299'
$rootEl=[System.Windows.Automation.AutomationElement]::RootElement
$cond=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,'Open')
$dlg=$rootEl.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$cond)
if(!$dlg){throw 'Open dialog missing'}
[MouseNative]::SetForegroundWindow([IntPtr]$dlg.Current.NativeWindowHandle)|Out-Null
$r=$dlg.Current.BoundingRectangle
function Click($x,$y){[MouseNative]::SetCursorPos([int]$x,[int]$y)|Out-Null; [MouseNative]::mouse_event(0x0002,0,0,0,[IntPtr]::Zero); [MouseNative]::mouse_event(0x0004,0,0,0,[IntPtr]::Zero); Start-Sleep -Milliseconds 250}
Click ($r.Left+400) ($r.Top+80)
[System.Windows.Forms.SendKeys]::SendWait('^a')
[System.Windows.Forms.Clipboard]::SetText($target)
[System.Windows.Forms.SendKeys]::SendWait('^v')
[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
Start-Sleep -Milliseconds 1200
Click ($r.Left+800) ($r.Top+80)
[System.Windows.Forms.SendKeys]::SendWait('^a')
[System.Windows.Forms.SendKeys]::SendWait('{BACKSPACE}')
[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
Start-Sleep -Milliseconds 1200
Click ($r.Left+500) ($r.Top+300)
[System.Windows.Forms.SendKeys]::SendWait('^a')
Start-Sleep -Milliseconds 400
Click ($r.Left+773) ($r.Top+566)
Start-Sleep -Milliseconds 2000
'selected and opened'

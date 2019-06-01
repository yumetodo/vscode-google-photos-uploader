# google-photos-uploader

![icon](images/icon.png)

This extension just provides `google-photos-uploader: Upload image and replace` command.

The command will do all the step shown below:

1. extract img path from your **markdown** text
2. upload to [Google Photos](https://www.google.com/photos/about/)
3. replace img path to Google Photos published url

![select_upload](images/select_upload.gif)

## How to use

### Run command

Open command palet(`Ctrl`+`Shift`+`P`), find `google-photos-uploader: Upload image and replace` command and execute.

![run command](images/first&#32;step.png)

### (OAuth)

This plugin sometimes request you OAuth Authentication.

In this case, default browser will be started.

1. Select Google acount and login  
![oauth_select_account](images/oauth_select_account.png)
2. Authorize these parmissions  
![oauth_parmission_1](images/oauth_parmission_1.png)  
![oauth_parmission_2](images/oauth_parmission_2.png)
3. Authorize these parmissions again!(I don't know why authorize phase are duplicated)  
![oauth_parmission_3](images/oauth_parmission_3.png)
4. Copy auth token(DO NOT TELL THIS TO OTHER PEOPLE)  
![oauth_parmission_4](images/oauth_parmission_4.png)
5. Go back to vscode. Then, paste auto token.  
![oauth_parmission_5](images/oauth_parmission_5.png)  
![oauth_parmission_6](images/oauth_parmission_6.png)

## Select Album

Because of Google Photos API limitation, albums you can add photos must be created by this plugin.

So, you have 3 choices to upload images.

1. I don't want to add photos to albums: not tested
2. create a new album
3. select album already created by this plugin

![select album](images/select&#32;album.png)

When you chose `create a new album`, you need to specify the new album name.

![create album](images/create&#32;album.png)

## Please wait for seconds

On this phase, this plugin executes below:

1. extract image path
2. upload image (depend on the total image size and your traffic speed, showing progress info)
3. register images to the album
4. get published image URL
5. replace image path to the URL

![uploading](images/uploading.png)

![select_upload](images/select_upload.gif)

## Known Issue

Image syntax written in code blocks in lists will also be replaced due to markdown parse bug in [`markdown_img_url_editor`](https://github.com/yumetodo/markdown_img_url_editor).

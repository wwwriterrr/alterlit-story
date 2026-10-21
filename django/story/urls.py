from django.urls import path

from api.story import views

# в api/urls.py: path('story/', include('api.story.urls')),
urlpatterns = [
    path('', views.StoryList.as_view(), name='story'),
    path('<int:pk>/', views.StoryDetail.as_view(), name='story-detail'),
    path('candidates/', views.Candidates.as_view(), name='story-candidates'),
]
